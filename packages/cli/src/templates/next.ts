import { posix } from "node:path";
import type { ProjectInfo } from "../project.js";
import { convexLibFile } from "./convex.js";

export interface GeneratedFile {
  path: string;
  content: string;
}

/** Import relatif sans extension, valable sans alias `@/` configuré. */
function importFrom(fromFile: string, toFileWithoutExt: string): string {
  const relative = posix.relative(posix.dirname(fromFile), toFileWithoutExt);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export function nextAppFiles(project: ProjectInfo, stores: "memory" | "convex" = "memory"): GeneratedFile[] {
  const base = project.appDir ?? "app";
  const ext = project.typescript ? "ts" : "js";
  const lib = `${project.srcDir ? "src/lib" : "lib"}/pont`;
  const hooks = `${base}/api/pont/hooks/[provider]/route.${ext}`;
  const cron = `${base}/api/pont/cron/route.${ext}`;
  const demo = `${base}/pont-demo/actions.${ext}`;
  const withRelay = stores === "convex";

  return [
    stores === "convex"
      ? convexLibFile(`${lib}.${ext}`)
      : {
      path: `${lib}.${ext}`,
      content: `import { createPontFromEnv } from "@pont-bj/node";

// Vos clés d'agrégateur restent dans vos variables d'environnement : Pont ne les reçoit jamais.
// Avant le live : branchez un stockage persistant (ex. @pont-bj/store-convex) via l'option \`stores\`.
export const pont = createPontFromEnv({
  onEvent: async (event) => {
    // Réagissez ici aux changements d'état (commande payée, retrait envoyé…).
    console.info("[pont]", event.type, event.data.id);
  },
});
`,
    },
    {
      path: hooks,
      content: `import { createWebhookRoute } from "@pont-bj/node";
import { pont } from "${importFrom(hooks, lib)}";

// Webhooks entrants des agrégateurs. Ne lisez pas le corps avant Pont : les signatures portent sur les octets bruts.
export const { POST } = createWebhookRoute(pont);
`,
    },
    {
      path: cron,
      content: `import { createCronRoute } from "@pont-bj/node";
import { ${withRelay ? "pont, relay" : "pont"} } from "${importFrom(cron, lib)}";

// Réconciliation périodique${withRelay ? " + livraison des webhooks" : ""}. vercel.json : { "crons": [{ "path": "/api/pont/cron", "schedule": "*/5 * * * *" }] }
export const { GET } = createCronRoute(pont, { ${withRelay ? "relay, " : ""}secret: process.env.CRON_SECRET });
`,
    },
    {
      path: demo,
      content: `"use server";

import { pont } from "${importFrom(demo, lib)}";

// Exemple : le montant est fixé ici, côté serveur, jamais par le navigateur.
export async function payerCommande(orderId${project.typescript ? ": string" : ""}, phone${project.typescript ? ": string" : ""}) {
  const amount = 5000; // à lire depuis votre base, à partir de orderId
  const payment = await pont.createPayment(
    { amount, currency: "XOF", country: "BJ", customer: { phone }, reference: orderId },
    \`order-\${orderId}\`, // même commande = même clé : un double clic ne crée pas deux paiements
  );
  return { id: payment.id, status: payment.status, nextAction: payment.nextAction };
}
`,
    },
  ];
}

export function expressFiles(project: ProjectInfo): GeneratedFile[] {
  const ext = project.typescript ? "ts" : "js";
  const dir = project.srcDir ? "src" : ".";
  return [
    {
      path: posix.join(dir, `pont.${ext}`),
      content: `import express from "express";
import { createPontFromEnv, handleProviderRequest } from "@pont-bj/node";

// Vos clés d'agrégateur restent dans vos variables d'environnement : Pont ne les reçoit jamais.
export const pont = createPontFromEnv();

/** Monte la route des webhooks agrégateurs : app.use(pontRouter) — avant express.json(). */
export const pontRouter = express.Router();

// Corps brut obligatoire : les signatures portent sur les octets exacts.
pontRouter.post("/api/pont/hooks/:provider", express.raw({ type: "*/*" }), async (req, res) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  const request = new Request(\`\${req.protocol}://\${req.get("host")}\${req.originalUrl}\`, { method: "POST", headers, body: req.body });
  const response = await handleProviderRequest(pont, req.params.provider, request);
  res.status(response.status).json(await response.json());
});
`,
    },
  ];
}
