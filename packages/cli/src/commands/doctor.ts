import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { detectProject } from "../project.js";

export interface Finding {
  level: "error" | "warning";
  code: string;
  message: string;
  fix: string;
  file?: string;
}

export interface DoctorReport {
  findings: Finding[];
  filesScanned: number;
  ok: boolean;
}

const IGNORED_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", "vendor", ".vercel", "coverage", ".turbo", "_generated"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 5_000;

/** Noms de variables qui contiennent un secret d'agrégateur ou de Pont. */
const SECRET_VAR = /\b(FEDAPAY_(SECRET_KEY|WEBHOOK_SECRET)|PAWAPAY_API_TOKEN|PAYDUNYA_(MASTER_KEY|PRIVATE_KEY|TOKEN)|KKIAPAY_(PRIVATE_KEY|SECRET_KEY|WEBHOOK_SECRET)|CINETPAY_API_KEY|PONT_STORE_SECRET|PONT_WEBHOOK_SECRET|CRON_SECRET)\b/;
const PUBLIC_SECRET = /\bNEXT_PUBLIC_[A-Z0-9_]*(FEDAPAY|PAWAPAY|PAYDUNYA|KKIAPAY|CINETPAY|PONT)[A-Z0-9_]*(SECRET|PRIVATE|TOKEN|MASTER)[A-Z0-9_]*/;
const CREATE_CALL = /\.(createPayment|createPayout|createRefund)\s*\(/;

function listSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (IGNORED_DIRS.has(name)) continue;
      const path = join(dir, name);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) walk(path);
      else if (SOURCE_EXT.test(name) && stats.size <= MAX_FILE_BYTES) out.push(path);
    }
  };
  walk(root);
  return out;
}

function isClientModule(content: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(content);
}

function readEnvFiles(root: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match?.[1]) values[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

function trackedEnvFiles(root: string): string[] | null {
  try {
    const output = execFileSync("git", ["ls-files", "--", ".env", ".env.*", "**/.env", "**/.env.*"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return output.split("\n").filter((file) => file && !/\.env\.(example|sample|template)$/.test(file));
  } catch {
    return null; // pas un dépôt git
  }
}

/** Audit statique de l'intégration Pont. Heuristique : ne remplace pas une revue de code. */
export function runDoctor(root: string): DoctorReport {
  const findings: Finding[] = [];
  const project = detectProject(root);
  const files = listSources(root);

  let hasWebhookRoute = false;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const rel = relative(root, file);
    const client = isClientModule(content);

    if (/api[\\/]pont[\\/]hooks/.test(rel) || content.includes("createWebhookRoute(") || content.includes("handleProviderRequest(")) {
      hasWebhookRoute = true;
    }
    if (client && SECRET_VAR.test(content)) {
      findings.push({
        level: "error",
        code: "secret_in_client",
        file: rel,
        message: "Un secret (clé d'agrégateur, secret Pont ou cron) est référencé dans un composant client.",
        fix: "Déplacez ce code dans un Server Component, une Server Action ou une route API.",
      });
    }
    if (PUBLIC_SECRET.test(content)) {
      findings.push({
        level: "error",
        code: "public_secret_variable",
        file: rel,
        message: "Une variable NEXT_PUBLIC_ contient un secret de paiement : elle sera envoyée au navigateur.",
        fix: "Retirez le préfixe NEXT_PUBLIC_ et lisez la variable côté serveur uniquement.",
      });
    }
    if (client && CREATE_CALL.test(content)) {
      findings.push({
        level: "error",
        code: "payment_created_in_client",
        file: rel,
        message: "Un paiement, retrait ou remboursement est créé depuis un composant client : le montant pourrait être falsifié.",
        fix: "Créez l'opération dans une Server Action ou une route API ; le navigateur ne reçoit que l'action à effectuer.",
      });
    }
    if (/searchParams\.get\(\s*["']status["']\s*\)/.test(content) && /(approved|succeeded|completed|paid)/i.test(content)) {
      findings.push({
        level: "warning",
        code: "status_from_return_url",
        file: rel,
        message: "Le statut semble lu depuis l'URL de retour, qu'un client peut modifier.",
        fix: "Relisez le paiement avec `pont.getPayment(id)` / `pont.refreshPayment(id)` avant de livrer.",
      });
    }
    if (/\bpont\.createPayment\s*\(/.test(content) && /amount\s*:\s*(req\.body|body|formData\.get|request\.json)/.test(content)) {
      findings.push({
        level: "warning",
        code: "amount_from_request",
        file: rel,
        message: "Le montant semble provenir directement de la requête du client.",
        fix: "Recalculez le montant côté serveur à partir de la commande en base.",
      });
    }
  }

  for (const name of [".env", ".env.local", ".env.production"]) {
    const path = join(root, name);
    if (existsSync(path) && PUBLIC_SECRET.test(readFileSync(path, "utf8"))) {
      findings.push({
        level: "error",
        code: "public_secret_variable",
        file: name,
        message: "Une variable NEXT_PUBLIC_ contient un secret de paiement.",
        fix: "Retirez le préfixe NEXT_PUBLIC_.",
      });
    }
  }

  if ((project.stack === "next-app" || project.stack === "express") && !hasWebhookRoute) {
    findings.push({
      level: "warning",
      code: "missing_webhook_route",
      message: "Aucune route de webhooks Pont trouvée : les paiements ne seront confirmés que par la réconciliation.",
      fix: "Lancez `npx pont init` ou ajoutez `createWebhookRoute(pont)` dans app/api/pont/hooks/[provider]/route.ts.",
    });
  }

  const tracked = trackedEnvFiles(root);
  if (tracked && tracked.length > 0) {
    findings.push({
      level: "error",
      code: "env_file_committed",
      file: tracked.join(", "),
      message: "Des fichiers .env sont suivis par git : vos secrets sont dans l'historique du dépôt.",
      fix: "`git rm --cached <fichier>`, ajoutez-le à .gitignore, puis changez TOUTES les clés concernées chez les agrégateurs.",
    });
  }

  const env = readEnvFiles(root);
  if (env.PONT_MODE === "live") {
    if (env.PONT_SANDBOX === "true") {
      findings.push({ level: "error", code: "sandbox_in_live", message: "PONT_SANDBOX=true avec PONT_MODE=live.", fix: "Retirez PONT_SANDBOX en production." });
    }
    if (env.PONT_PUBLIC_URL?.startsWith("http://")) {
      findings.push({ level: "error", code: "http_in_live", message: "PONT_PUBLIC_URL est en HTTP en mode live.", fix: "Utilisez l'URL HTTPS de production." });
    }
  }
  if (env.CRON_SECRET !== undefined && env.CRON_SECRET.length < 16) {
    findings.push({ level: "warning", code: "weak_cron_secret", message: "CRON_SECRET fait moins de 16 caractères.", fix: "`openssl rand -hex 24`" });
  }
  if (env.PONT_STORE_SECRET !== undefined && env.PONT_STORE_SECRET.length < 32) {
    findings.push({ level: "error", code: "weak_store_secret", message: "PONT_STORE_SECRET fait moins de 32 caractères.", fix: "`openssl rand -hex 32`" });
  }

  return { findings, filesScanned: files.length, ok: findings.every((finding) => finding.level !== "error") };
}

export function formatReport(report: DoctorReport): string {
  const lines = [`pont doctor : ${report.filesScanned} fichiers analysés`];
  if (report.findings.length === 0) lines.push("✅ Aucun problème détecté.");
  for (const finding of report.findings) {
    lines.push(`${finding.level === "error" ? "❌" : "⚠️ "} [${finding.code}] ${finding.message}${finding.file ? `\n   → ${finding.file}` : ""}\n   Correctif : ${finding.fix}`);
  }
  const errors = report.findings.filter((f) => f.level === "error").length;
  const warnings = report.findings.length - errors;
  if (report.findings.length > 0) lines.push(`${errors} erreur(s), ${warnings} avertissement(s).`);
  return lines.join("\n");
}
