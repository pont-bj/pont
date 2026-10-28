// Génère les pages de référence API (content/docs/reference/api) à partir de public/openapi.json.
import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";

const openapi = createOpenAPI({ input: ["./public/openapi.json"] });
await generateFiles({ input: openapi, output: "content/docs/reference/api", per: "tag" });

// URL sans accents ni espaces.
import { renameSync, writeFileSync } from "node:fs";
const slugs: Record<string, string> = {
  "santé": "sante",
  "webhooks-entrants": "webhooks-entrants",
  "paiements": "paiements",
  "retraits": "retraits",
  "portefeuilles": "portefeuilles",
  "administration": "administration",
  "clés-et-agrégateurs": "cles",
  "webhooks-sortants": "webhooks-sortants",
  "e-mail-et-alertes": "email-et-alertes",
};
for (const [from, to] of Object.entries(slugs)) {
  if (from !== to) renameSync(`content/docs/reference/api/${from}.mdx`, `content/docs/reference/api/${to}.mdx`);
}
writeFileSync(
  "content/docs/reference/api/meta.json",
  `${JSON.stringify({ title: "API", pages: ["index", "paiements", "retraits", "portefeuilles", "webhooks-sortants", "webhooks-entrants", "sante", "administration", "cles", "email-et-alertes"] }, null, 2)}\n`,
);
