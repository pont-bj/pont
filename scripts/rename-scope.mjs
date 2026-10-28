#!/usr/bin/env node
// Renomme le scope npm dans tout le dépôt (fichiers suivis par git, hors pnpm-lock.yaml).
// Usage : node scripts/rename-scope.mjs @pont @nouveau-scope [--dry]
// Puis : mettre à jour "scope" dans scripts/publish-meta.json, `pnpm install`, `pnpm -r build`.
// Les noms de binaires (`pont`, `pont-mcp`, `pont-server`) et le nom de code dans les textes ne sont PAS touchés.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [ancien, nouveau, ...flags] = process.argv.slice(2);
const dry = flags.includes("--dry");
if (!ancien?.startsWith("@") || !nouveau?.startsWith("@") || !/^@[a-z0-9][a-z0-9-]*$/.test(nouveau)) {
  console.error("Usage : node scripts/rename-scope.mjs @ancien @nouveau [--dry]");
  process.exit(1);
}
const fichiers = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && f !== "pnpm-lock.yaml" && !f.startsWith("docs/providers/") && !f.startsWith(".claude/skills/"))
  .filter((f) => /\.(ts|tsx|js|mjs|json|md|mdx|yml|yaml|php|sh|prisma)$/.test(f));
let total = 0;
for (const f of fichiers) {
  let texte;
  try { texte = readFileSync(f, "utf8"); } catch { continue; }
  const sortie = texte.split(`${ancien}/`).join(`${nouveau}/`);
  if (sortie !== texte) {
    total++;
    console.log(`${dry ? "[simulation] " : ""}${f}`);
    if (!dry) writeFileSync(f, sortie);
  }
}
console.log(`${total} fichier(s) ${dry ? "concerné(s)" : "modifié(s)"}.`);
