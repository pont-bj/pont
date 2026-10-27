import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Stack = "next-app" | "next-pages" | "express" | "laravel" | "php" | "unknown";
export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export interface ProjectInfo {
  root: string;
  stack: Stack;
  packageManager: PackageManager;
  typescript: boolean;
  /** `src/app` ou `app` pour Next.js App Router. */
  appDir: string | null;
  srcDir: boolean;
  hasConvex: boolean;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function dependencies(pkg: Record<string, unknown> | null): Record<string, unknown> {
  if (!pkg) return {};
  const deps = typeof pkg.dependencies === "object" && pkg.dependencies !== null ? pkg.dependencies : {};
  const dev = typeof pkg.devDependencies === "object" && pkg.devDependencies !== null ? pkg.devDependencies : {};
  return { ...(deps as Record<string, unknown>), ...(dev as Record<string, unknown>) };
}

export function detectProject(root: string): ProjectInfo {
  const pkg = readJson(join(root, "package.json"));
  const deps = dependencies(pkg);
  const composer = readJson(join(root, "composer.json"));

  const packageManager: PackageManager = existsSync(join(root, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(root, "yarn.lock"))
      ? "yarn"
      : existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))
        ? "bun"
        : "npm";

  const appDir = ["src/app", "app"].find((dir) => existsSync(join(root, dir))) ?? null;
  const pagesDir = ["src/pages", "pages"].find((dir) => existsSync(join(root, dir))) ?? null;

  let stack: Stack = "unknown";
  if ("next" in deps) stack = appDir ? "next-app" : pagesDir ? "next-pages" : "next-app";
  else if ("express" in deps) stack = "express";
  else if (composer) {
    const require = { ...((composer.require as Record<string, unknown>) ?? {}) };
    stack = "laravel/framework" in require ? "laravel" : "php";
  }

  return {
    root,
    stack,
    packageManager,
    typescript: existsSync(join(root, "tsconfig.json")),
    appDir,
    srcDir: existsSync(join(root, "src")),
    hasConvex: "convex" in deps || existsSync(join(root, "convex")),
  };
}

export function installCommand(pm: PackageManager, packages: string[]): string {
  const verb = pm === "npm" ? "install" : "add";
  return `${pm} ${verb} ${packages.join(" ")}`;
}
