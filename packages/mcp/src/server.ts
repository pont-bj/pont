import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildWebhookDelivery, type PontEvent } from "@pont/engine";
import { SCENARIO_NAMES, addRecipe, detectProject, listRecipes, runDoctor, runInit, runTrigger } from "@pont/cli";
import { COUNTRIES, DOCS, ERROR_CODES, OPERATORS, coverage, explainError, searchDocs } from "./knowledge.js";

// Serveur MCP niveau 1 : intégration. Sandbox uniquement — aucun outil n'effectue d'opération réelle.

type ToolResult = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

function ok(data: Record<string, unknown>, summary?: string): ToolResult {
  return {
    content: [{ type: "text", text: summary ? `${summary}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Le dossier projet doit être un chemin absolu existant (pas de chemin relatif ambigu pour l'agent). */
function checkProjectDir(projectDir: string): string | null {
  if (!isAbsolute(projectDir)) return "projectDir doit être un chemin absolu.";
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) return `Dossier introuvable : ${projectDir}`;
  return null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const projectDirSchema = z.string().describe("Chemin absolu du projet à intégrer.");
const scenarioSchema = z.enum(SCENARIO_NAMES as [string, ...string[]]).describe("Scénario du sandbox Pont.");

export function createPontMcpServer(options: { fetch?: typeof fetch } = {}): McpServer {
  const fetchImpl = options.fetch ?? fetch;
  const server = new McpServer(
    { name: "pont", version: "0.1.0" },
    {
      instructions:
        "Pont intègre les paiements mobile money africains (FedaPay, PawaPay, PayDunya, Kkiapay). " +
        "Pour intégrer : detect_stack → scaffold_integration (apply=false pour prévisualiser, puis apply=true) → create_test_payment → run_doctor. " +
        "Pour une fintech (portefeuille, tontine…) : list_recipes avec la description du projet, puis apply_recipe. " +
        "Règles : montant fixé côté serveur, clé d'idempotence sur chaque création, ne livrer que sur status=succeeded. " +
        "Tous les outils fonctionnent en sandbox ; aucun n'effectue d'opération financière réelle.",
    },
  );

  server.registerTool(
    "detect_stack",
    {
      title: "Détecter la stack",
      description: "Identifie le framework (Next.js, Express, Laravel…), TypeScript, le gestionnaire de paquets et indique si Pont sait générer l'intégration.",
      inputSchema: { projectDir: projectDirSchema },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const error = checkProjectDir(projectDir);
      if (error) return fail(error);
      const project = detectProject(projectDir);
      return ok({ ...project, scaffoldSupported: project.stack === "next-app" || project.stack === "express" });
    },
  );

  server.registerTool(
    "scaffold_integration",
    {
      title: "Générer l'intégration",
      description:
        "Génère les fichiers Pont (configuration, route des webhooks, route cron, exemple d'action serveur), complète .env.local en sandbox et .gitignore. " +
        "N'écrase jamais un fichier existant. Par défaut, prévisualise seulement (apply=false).",
      inputSchema: {
        projectDir: projectDirSchema,
        apply: z.boolean().default(false).describe("false = prévisualisation, true = écrire les fichiers."),
        agentInstructions: z.boolean().default(true).describe("Ajouter les consignes Pont dans AGENTS.md."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, apply, agentInstructions }) => {
      const error = checkProjectDir(projectDir);
      if (error) return fail(error);
      const log: string[] = [];
      const result = await runInit({ cwd: projectDir, agent: agentInstructions, dryRun: !apply, testPayment: false, log: (line) => log.push(line) });
      return ok(
        {
          applied: apply,
          stack: result.project.stack,
          created: result.created,
          skipped: result.skipped,
          envAdded: result.envAdded,
          installCommand: result.installCommand,
          log,
        },
        apply
          ? `Intégration écrite. Lancez ensuite : ${result.installCommand ?? "(stack non supportée)"}`
          : "Prévisualisation : rien n'a été écrit. Relancez avec apply=true pour appliquer.",
      );
    },
  );

  server.registerTool(
    "get_coverage",
    {
      title: "Couverture des agrégateurs",
      description: "Quels agrégateurs couvrent quel pays / opérateur, pour le dépôt, le retrait et le remboursement. Basé sur les capacités documentées, pas sur un compte réel.",
      inputSchema: {
        country: z.enum(COUNTRIES as [string, ...string[]]).optional(),
        operator: z.enum(OPERATORS as [string, ...string[]]).optional(),
        capability: z.enum(["deposit", "payout", "refund"]).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = coverage(args as Parameters<typeof coverage>[0]);
      return ok({ rows: result.rows, notes: result.notes }, `${result.rows.length} combinaison(s) couverte(s).`);
    },
  );

  server.registerTool(
    "create_test_payment",
    {
      title: "Paiement de test",
      description: "Exécute un paiement complet dans le sandbox Pont selon un scénario (succès, solde insuffisant, timeout ambigu…) et renvoie les événements que l'application recevrait.",
      inputSchema: { scenario: scenarioSchema.default("success") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ scenario }) => {
      const events = await runTrigger(scenario, () => {});
      return ok({ scenario, events: events.map(summarizeEvent) });
    },
  );

  server.registerTool(
    "simulate_webhook",
    {
      title: "Simuler un webhook Pont",
      description:
        "Produit les webhooks Pont signés (en-tête Pont-Signature) d'un scénario sandbox. Si `url` est fourni (localhost uniquement), les envoie au serveur de développement pour tester le handler.",
      inputSchema: {
        scenario: scenarioSchema.default("success"),
        secret: z.string().min(8).describe("Secret de signature attendu par le handler (ex. PONT_WEBHOOK_SECRET de test)."),
        url: z.string().url().optional().describe("Endpoint local, ex. http://localhost:3000/api/webhooks/pont"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ scenario, secret, url }) => {
      if (url && !LOCAL_HOSTS.has(new URL(url).hostname)) return fail("Par sécurité, `url` doit pointer vers localhost.");
      const events = await runTrigger(scenario, () => {});
      const deliveries = [];
      for (const event of events) {
        const delivery = buildWebhookDelivery(secret, event);
        let response: { status: number } | { error: string } | null = null;
        if (url) {
          try {
            const res = await fetchImpl(url, { method: "POST", headers: delivery.headers, body: delivery.body });
            response = { status: res.status };
          } catch (error) {
            response = { error: error instanceof Error ? error.message : String(error) };
          }
        }
        deliveries.push({ type: event.type, headers: delivery.headers, body: JSON.parse(delivery.body) as unknown, response });
      }
      return ok({ scenario, deliveries });
    },
  );

  server.registerTool(
    "explain_error",
    {
      title: "Expliquer une erreur",
      description: `Explique un code d'erreur Pont ou un failureCode et propose le correctif. Codes connus : ${ERROR_CODES.join(", ")}.`,
      inputSchema: { code: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ code }) => {
      const explanation = explainError(code);
      return explanation ? ok({ ...explanation }) : fail(`Code inconnu : ${code}. Codes connus : ${ERROR_CODES.join(", ")}.`);
    },
  );

  server.registerTool(
    "run_doctor",
    {
      title: "Audit de sécurité",
      description: "Analyse le projet : secrets exposés au navigateur, paiements créés côté client, statut lu dans l'URL de retour, .env commité, sandbox en live…",
      inputSchema: { projectDir: projectDirSchema },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectDir }) => {
      const error = checkProjectDir(projectDir);
      if (error) return fail(error);
      const report = runDoctor(projectDir);
      return ok({ ...report }, report.ok ? "✅ Aucune erreur bloquante." : "❌ Erreurs à corriger avant le live.");
    },
  );

  server.registerTool(
    "search_docs",
    {
      title: "Chercher dans la doc Pont",
      description: `Recherche dans la documentation Pont. Sections : ${DOCS.map((d) => d.id).join(", ")}.`,
      inputSchema: { query: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const sections = searchDocs(query);
      return ok({ results: sections.map((s) => ({ id: s.id, title: s.title, body: s.body })) });
    },
  );

  server.registerTool(
    "list_recipes",
    {
      title: "Cas d'usage (recettes)",
      description:
        "Liste les cas d'usage du framework Pont (portefeuille mobile, tontine, séquestre…). Avec `description`, classe les recettes " +
        "selon le projet décrit par l'utilisateur (ex. « appli de porte-monnaie avec recharge et retrait »).",
      inputSchema: { description: z.string().optional().describe("Description libre de la fintech à construire.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ description }) => {
      const recipes = listRecipes(description);
      return ok({ recipes }, recipes.length === 0 ? "Aucune recette ne correspond : proposez l'intégration de base (scaffold_integration)." : undefined);
    },
  );

  server.registerTool(
    "apply_recipe",
    {
      title: "Installer un cas d'usage",
      description:
        "Installe une recette dans le projet : génère le code (sans rien écraser) et renvoie la commande d'installation et les étapes " +
        "à faire. Par défaut, prévisualise seulement (apply=false). Prérequis : scaffold_integration déjà appliqué.",
      inputSchema: {
        projectDir: projectDirSchema,
        recipeId: z.string().min(1).describe("Identifiant de la recette (voir list_recipes)."),
        apply: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectDir, recipeId, apply }) => {
      const error = checkProjectDir(projectDir);
      if (error) return fail(error);
      const log: string[] = [];
      const result = addRecipe({ cwd: projectDir, recipeId, dryRun: !apply, log: (line) => log.push(line) });
      if (!result.recipe) return fail(log.join("\n"));
      return ok({ applied: apply, ...result, log }, apply ? "Recette installée." : "Prévisualisation : rien n'a été écrit.");
    },
  );

  for (const section of DOCS) {
    server.registerResource(
      `doc-${section.id}`,
      `pont://docs/${section.id}`,
      { title: section.title, mimeType: "text/markdown" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# ${section.title}\n\n${section.body}` }] }),
    );
  }

  return server;
}

function summarizeEvent(event: PontEvent) {
  return {
    type: event.type,
    id: event.data.id,
    status: event.data.status,
    failureCode: "failureCode" in event.data ? event.data.failureCode : null,
    needsReconciliation: event.data.needsReconciliation,
  };
}
