import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPontFromEnv } from "@pont-bj/node";
import { detectProject, installCommand, type ProjectInfo } from "../project.js";
import { AGENTS_MARKER_END, AGENTS_MARKER_START, agentsSection } from "../templates/agents.js";
import { NEW_SCHEMA, pontStoreFile, pontTablesFile } from "../templates/convex.js";
import { expressFiles, nextAppFiles, type GeneratedFile } from "../templates/next.js";

export interface InitOptions {
  cwd: string;
  /** Configure le projet pour un agent IA (AGENTS.md, config MCP). */
  agent: boolean;
  dryRun: boolean;
  /** Lance un paiement de test dans le sandbox à la fin. */
  testPayment: boolean;
  /** Stockage persistant à installer. `memory` : aucun (développement uniquement). */
  stores?: "memory" | "convex";
  log: (line: string) => void;
}

export interface InitResult {
  project: ProjectInfo;
  created: string[];
  skipped: string[];
  envAdded: string[];
  installCommand: string | null;
  /** Étapes que Pont ne fait pas automatiquement (fichiers du développeur, services externes). */
  manualSteps: string[];
  testPayment: { ok: boolean; ms: number; status: string } | null;
}

const PACKAGES = ["@pont-bj/node"];

function filesFor(project: ProjectInfo, stores: "memory" | "convex"): GeneratedFile[] | null {
  switch (project.stack) {
    case "next-app":
      return stores === "convex" ? [...nextAppFiles(project, "convex"), pontTablesFile(), pontStoreFile()] : nextAppFiles(project);
    case "express":
      return expressFiles(project);
    default:
      return null;
  }
}

/** Ajoute les variables manquantes sans jamais écraser une valeur existante. */
function envLines(existing: string, stores: "memory" | "convex"): string[] {
  const has = (name: string) => new RegExp(`^\\s*${name}\\s*=`, "m").test(existing);
  const lines: string[] = [];
  const add = (name: string, value: string) => {
    if (!has(name)) lines.push(`${name}=${value}`);
  };
  add("PONT_MODE", "test");
  add("PONT_SANDBOX", "true");
  add("PONT_PUBLIC_URL", "http://localhost:3000");
  add("CRON_SECRET", randomBytes(24).toString("hex"));
  if (stores === "convex") add("PONT_STORE_SECRET", randomBytes(32).toString("hex"));
  return lines;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { cwd, log } = options;
  const project = detectProject(cwd);
  const result: InitResult = { project, created: [], skipped: [], envAdded: [], installCommand: null, manualSteps: [], testPayment: null };

  log(`Stack détectée : ${project.stack}${project.typescript ? " (TypeScript)" : ""}, gestionnaire : ${project.packageManager}`);
  const stores = options.stores ?? "memory";
  if (stores === "convex" && project.stack !== "next-app") {
    log("⚠️  --stores convex est disponible pour Next.js (App Router) uniquement pour l'instant.");
    return result;
  }
  const files = filesFor(project, stores);
  if (!files) {
    const hint =
      project.stack === "laravel" || project.stack === "php"
        ? "Le SDK PHP/Laravel arrive bientôt."
        : project.stack === "next-pages"
          ? "Next.js Pages Router : utilisez `handleProviderRequest` de @pont-bj/node dans une route API."
          : "Stacks supportées : Next.js (App Router), Express.";
    log(`⚠️  Génération automatique non disponible pour cette stack. ${hint}`);
    return result;
  }

  // Fichiers : jamais d'écrasement. Relancer `init` est sans danger.
  for (const file of files) {
    const target = join(cwd, file.path);
    if (existsSync(target)) {
      result.skipped.push(file.path);
      log(`• existe déjà, inchangé : ${file.path}`);
      continue;
    }
    if (!options.dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
    result.created.push(file.path);
    log(`+ ${file.path}`);
  }

  // Variables d'environnement : .env.local (ignoré par git dans les projets Next.js standards).
  const envPath = join(cwd, project.stack === "next-app" ? ".env.local" : ".env");
  const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = envLines(existingEnv, stores);
  if (lines.length > 0) {
    if (!options.dryRun) {
      const prefix = existingEnv.length > 0 && !existingEnv.endsWith("\n") ? "\n" : "";
      writeFileSync(envPath, `${existingEnv}${prefix}\n# Pont (sandbox : aucun compte agrégateur requis)\n${lines.join("\n")}\n`);
    }
    result.envAdded = lines.map((line) => line.split("=")[0]!);
    log(`+ ${envPath.slice(cwd.length + 1)} : ${result.envAdded.join(", ")}`);
  }
  ensureGitignore(cwd, options.dryRun, log);

  if (options.agent) writeAgents(cwd, project, options.dryRun, log);
  if (stores === "convex") setupConvexSchema(cwd, options.dryRun, result, log);

  result.installCommand = installCommand(project.packageManager, stores === "convex" ? [...PACKAGES, "@pont-bj/store-convex", "convex"] : PACKAGES);
  log(`→ Installez le SDK : ${result.installCommand}`);

  if (options.testPayment) {
    result.testPayment = await sandboxPayment();
    log(
      result.testPayment.ok
        ? `✅ Premier paiement test réussi en ${result.testPayment.ms} ms (sandbox Pont, numéro +2290100000001).`
        : `❌ Paiement test : statut ${result.testPayment.status}.`,
    );
  }
  log("Prochaine étape : `npx pont doctor` pour vérifier la sécurité de l'intégration.");
  return result;
}

/** Paiement de bout en bout dans le sandbox, exécuté localement : prouve que le moteur fonctionne. */
export async function sandboxPayment(): Promise<{ ok: boolean; ms: number; status: string }> {
  const started = performance.now();
  const pont = createPontFromEnv({ env: { PONT_SANDBOX: "true", PONT_PUBLIC_URL: "http://localhost:3000" } });
  const created = await pont.createPayment(
    { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "pont-init" },
    `pont-init-${Date.now()}`,
  );
  const final = await pont.refreshPayment(created.id);
  return { ok: final.status === "succeeded", ms: Math.round(performance.now() - started), status: final.status };
}

/**
 * Schéma Convex : créé s'il n'existe pas ; s'il existe, on ne le modifie jamais automatiquement
 * (code du développeur) et on indique la ligne à ajouter.
 */
function setupConvexSchema(cwd: string, dryRun: boolean, result: InitResult, log: (line: string) => void): void {
  const path = join(cwd, NEW_SCHEMA.path);
  if (!existsSync(path)) {
    if (!dryRun) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, NEW_SCHEMA.content);
    }
    result.created.push(NEW_SCHEMA.path);
    log(`+ ${NEW_SCHEMA.path}`);
  } else if (!readFileSync(path, "utf8").includes("pontTables")) {
    result.manualSteps.push('Dans convex/schema.ts : `import { pontTables } from "./pontTables";` puis `...pontTables` dans defineSchema({ ... }).');
  }
  result.manualSteps.push("Convex : `npx convex env set PONT_STORE_SECRET <valeur de .env.local>`");
  for (const step of result.manualSteps) log(`→ À faire : ${step}`);
}

function ensureGitignore(cwd: string, dryRun: boolean, log: (line: string) => void): void {
  const path = join(cwd, ".gitignore");
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const covered = content.split("\n").some((line) => /^\.env(\*|\.local|\.\*)?$/.test(line.trim()));
  if (covered) return;
  if (!dryRun) writeFileSync(path, `${content}${content && !content.endsWith("\n") ? "\n" : ""}\n# Secrets\n.env\n.env*.local\n`);
  log("+ .gitignore : .env, .env*.local");
}

function writeAgents(cwd: string, project: ProjectInfo, dryRun: boolean, log: (line: string) => void): void {
  const path = join(cwd, "AGENTS.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const section = agentsSection(project.stack);
  const start = existing.indexOf(AGENTS_MARKER_START);
  const end = existing.indexOf(AGENTS_MARKER_END);
  const next =
    start !== -1 && end !== -1
      ? `${existing.slice(0, start)}${section.trimEnd()}${existing.slice(end + AGENTS_MARKER_END.length)}`
      : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${existing ? "\n" : ""}${section}`;
  if (!dryRun) writeFileSync(path, next);
  log(`+ AGENTS.md : consignes Pont pour agent IA`);
}
