import { source } from "@/lib/source";
import { BASE_PATH } from "@/lib/base-path";

export const revalidate = false;

/** Index lisible par les agents IA : une ligne par page, avec son URL publique sous /docs. */
export function GET() {
  const lines = source.getPages().map((page) => `- [${page.data.title}](${BASE_PATH}${page.url === "/" ? "" : page.url}) : ${page.data.description ?? ""}`.trimEnd());
  const body = ["# Pont", "", "> Orchestrateur de paiement non-custodial et backend de fintech pour l'Afrique francophone (FedaPay, PawaPay, PayDunya, Kkiapay). Self-host gratuit.", "", "## Documentation", "", ...lines, ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
