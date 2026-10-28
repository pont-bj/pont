import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { GeneratedFile } from "./next.js";

const require = createRequire(import.meta.url);

function shipped(file: string): string {
  return readFileSync(require.resolve(`@pont-bj/store-convex/convex/${file}`), "utf8");
}

/** Tables Pont, copiées dans le projet pour éviter de compiler du TypeScript depuis node_modules. */
export function pontTablesFile(): GeneratedFile {
  const schema = shipped("schema.ts");
  const content = schema.replace(/\nexport default defineSchema\(pontTables\);\n?$/, "\n").replace('import { defineSchema, defineTable } from "convex/server";', 'import { defineTable } from "convex/server";');
  return { path: "convex/pontTables.ts", content: `// Généré par \`pont init --stores convex\`. Ne pas modifier : relancez la commande après une mise à jour.\n${content}` };
}

export function pontStoreFile(): GeneratedFile {
  return { path: "convex/pontStore.ts", content: `// Généré par \`pont init --stores convex\`. Ne pas modifier : relancez la commande après une mise à jour.\n${shipped("pontStore.ts")}` };
}

export const NEW_SCHEMA: GeneratedFile = {
  path: "convex/schema.ts",
  content: `import { defineSchema } from "convex/server";
import { pontTables } from "./pontTables";

export default defineSchema({
  ...pontTables,
});
`,
};

export function convexLibFile(libPath: string): GeneratedFile {
  return {
    path: libPath,
    content: `import { ConvexHttpClient } from "convex/browser";
import { createConvexStores } from "@pont-bj/store-convex";
import { createPontFromEnv, WebhookRelay } from "@pont-bj/node";

// Vos clés d'agrégateur restent dans vos variables d'environnement : Pont ne les reçoit jamais.
// PONT_STORE_SECRET doit être identique ici et dans Convex : npx convex env set PONT_STORE_SECRET <valeur>
const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl || !process.env.PONT_STORE_SECRET) {
  throw new Error("CONVEX_URL (ou NEXT_PUBLIC_CONVEX_URL) et PONT_STORE_SECRET sont requis pour le stockage Pont.");
}

const stores = createConvexStores({ client: new ConvexHttpClient(convexUrl), secret: process.env.PONT_STORE_SECRET });

// Webhooks vers votre propre application (facultatif) : PONT_WEBHOOK_URL + PONT_WEBHOOK_SECRET.
export const relay = process.env.PONT_WEBHOOK_URL
  ? new WebhookRelay({
      mode: process.env.PONT_MODE === "live" ? "live" : "test",
      endpoints: [{ id: "app", url: process.env.PONT_WEBHOOK_URL, secret: process.env.PONT_WEBHOOK_SECRET ?? "" }],
      store: stores.deliveries,
    })
  : undefined;

export const pont = createPontFromEnv({
  stores,
  onEvent: async (event) => {
    await relay?.enqueue(event);
  },
});
`,
  };
}
