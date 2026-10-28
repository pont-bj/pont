#!/usr/bin/env node
// Applique les métadonnées de publication (scripts/publish-meta.json) à tous les
// packages de packages/** et ajoute un README.md minimal s'il manque.
// Usage : node scripts/apply-publish-meta.mjs   (idempotent)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const meta = JSON.parse(readFileSync(join(root, "scripts/publish-meta.json"), "utf8"));

function findPackages(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (existsSync(join(p, "package.json"))) out.push(p);
    else out.push(...findPackages(p));
  }
  return out;
}

for (const dir of findPackages(join(root, "packages"))) {
  const rel = relative(root, dir);
  const file = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const isPrivate = meta.private.includes(rel);
  pkg.version = meta.version;
  pkg.license = meta.license;
  pkg.author = meta.author;
  pkg.repository = { type: "git", url: `git+${meta.repoUrl}.git`, directory: rel };
  pkg.homepage = meta.homepage;
  pkg.bugs = { url: meta.bugs };
  pkg.keywords = meta.keywords;
  pkg.engines = { node: meta.node };
  if (isPrivate) {
    pkg.private = true;
    delete pkg.publishConfig;
  } else {
    delete pkg.private;
    pkg.files = [...new Set([...(pkg.files ?? ["dist"]), "dist", "README.md"])];
    pkg.publishConfig = { ...(pkg.publishConfig ?? {}), access: "public" };
    if (!pkg.publishConfig.main) {
      pkg.publishConfig.main = "./dist/index.js";
      pkg.publishConfig.types = "./dist/index.d.ts";
      pkg.publishConfig.exports = { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } };
    }
  }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${isPrivate ? "privé   " : "publiable"} ${pkg.name}`);
}
