import { AvertissementUrlPublique } from "@/components/avertissement-url";
import { BoutonCopier } from "@/components/bouton-copier";
import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { Carte, CarteEntete } from "@/components/ui";
import { ilYA } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, getWebhooks, listProviders } from "@/lib/pont";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Développeurs" };

function Commande({ titre, texte, commande, note }: { titre: string; texte: string; commande: string; note: string }) {
  return (
    <Carte className="flex flex-col gap-3.5 px-6 pb-6 pt-[22px]">
      <h2 className="text-lg font-semibold">{titre}</h2>
      <p className="text-sm text-zinc-500">{texte}</p>
      <div className="flex items-center gap-3 rounded-[10px] bg-[#18181b] px-4 py-3.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-sans text-base font-medium text-ligne">{commande}</code>
        <BoutonCopier texte={commande} sombre />
      </div>
      <p className="text-xs text-zinc-400">{note}</p>
    </Carte>
  );
}

export default async function Integration() {
  const session = await requireSession();
  const [overview, webhooks] = await Promise.all([getOverview(), session.roles.can(session.user.role, "webhooks", "lire") ? getWebhooks().catch(() => null) : null]);
  // L'adresse publique vient du serveur lui-même (celle qu'il annonce aux agrégateurs), pas de l'adresse interne Docker.
  const urlApi = webhooks?.inbound[0]?.url.replace(/\/hooks\/[^/]+$/, "") ?? "Définie par PONT_PUBLIC_URL sur le serveur";
  // Sans droit sur les webhooks, l'adresse se déduit de la liste des agrégateurs.
  const adressePublique =
    webhooks?.inbound[0]?.url.replace(/\/hooks\/[^/]+$/, "") ??
    (await listProviders().then((r) => r.data[0]?.webhookUrl.replace(/\/hooks\/[^/]+$/, "") ?? null).catch(() => null));
  const dernier = webhooks?.deliveries[0];
  const maintenant = Date.now();

  return (
    <Coque actif="/developpeurs" titre="Développeurs" {...propsCoque(session, overview)}>
      <AvertissementUrlPublique adresse={adressePublique} />
      <Section id="commandes">
      <div className="grid gap-4 lg:grid-cols-2">
        <Commande titre="Intégrer en une commande" texte="Détecte votre projet (Next.js, Express), génère les routes et lance un paiement de test." commande="npx pont init" note="Puis : npx pont doctor pour vérifier la sécurité." />
        <Commande titre="Ou laissez votre agent IA intégrer" texte="Claude Code, Cursor ou Windsurf : ajoutez le serveur MCP, puis décrivez votre besoin." commande="claude mcp add pont -- npx -y @pont/mcp" note="Exemple : « Ajoute le paiement mobile money au checkout. »" />
      </div>
      </Section>

      <Section id="connexion">
      <Carte className="pb-1">
        <CarteEntete titre="Connexion à votre serveur" texte="La clé API de votre application est définie dans PONT_API_KEY sur le serveur : Pont ne l'affiche jamais." />
        <dl>
          <div className="flex items-center gap-6 border-t border-ligne px-6 py-[13px] text-sm">
            <dt className="w-[180px] shrink-0 text-zinc-500">URL de l'API</dt>
            <dd className="min-w-0 flex-1 truncate font-medium">{urlApi}</dd>
            {webhooks && <BoutonCopier texte={urlApi} />}
          </div>
          <div className="flex items-center gap-6 border-t border-ligne px-6 py-[13px] text-sm">
            <dt className="w-[180px] shrink-0 text-zinc-500">Clé API</dt>
            <dd className="min-w-0 flex-1 truncate font-medium text-zinc-500">Variable PONT_API_KEY (fichier .env du serveur)</dd>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ligne px-6 py-[13px] text-sm">
            <dt className="w-[180px] shrink-0 text-zinc-500">Webhook</dt>
            <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 font-medium">
              {webhooks === null || webhooks === undefined ? (
                <span className="text-zinc-500">Réservé aux rôles qui gèrent les webhooks.</span>
              ) : webhooks.endpoints.length === 0 ? (
                <span className="text-zinc-500">Aucun destinataire configuré</span>
              ) : (
                <>
                  <span className="truncate">{webhooks.endpoints[0]!.url}</span>
                  {dernier && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-2.5 text-xs font-medium ${dernier.status === "delivered" ? "bg-[#f0fdf4] text-[#15803d]" : dernier.status === "failed" ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-ligne text-zinc-600"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dernier.status === "delivered" ? "bg-[#16a34a]" : dernier.status === "failed" ? "bg-[#dc2626]" : "bg-zinc-400"}`} />
                      Dernier envoi : {dernier.status === "delivered" ? `${dernier.lastHttpStatus ?? "OK"} OK` : dernier.status === "failed" ? "échec" : "en attente"} · {ilYA(dernier.createdAt, maintenant)}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
        </dl>
      </Carte>
      </Section>

      <Section id="agregateur-personnalise">
      <Carte className="flex flex-col gap-3.5 px-6 pb-6 pt-[22px]">
        <h2 className="text-lg font-semibold">Ajouter un agrégateur personnalisé</h2>
        <p className="text-sm text-zinc-500">Votre agrégateur n'est pas dans la liste ? Pont génère l'adaptateur à partir de quelques réponses.</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-zinc-700">
          <li>Lancez la commande ci-dessous : elle pose les questions (adresses de l'API, noms des clés, signature des webhooks, correspondance des statuts), ou lit un fichier avec <code className="font-medium">--from spec.json</code>.</li>
          <li>Placez le dossier généré dans le dossier des plugins du serveur (<code className="font-medium">PONT_PLUGINS_DIR</code>).</li>
          <li>Redémarrez le serveur : un nouveau plugin n'est détecté qu'au démarrage.</li>
          <li>Saisissez les clés dans la page Clés : elles sont prises en compte tout de suite.</li>
        </ol>
        <div className="flex items-center gap-3 rounded-[10px] bg-[#18181b] px-4 py-3.5">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-sans text-base font-medium text-ligne">npx pont provider new</code>
          <BoutonCopier texte="npx pont provider new" sombre />
        </div>
        <p className="text-xs text-zinc-400">Option <code>--dry-run</code> pour prévisualiser sans écrire de fichier.</p>
      </Carte>
      </Section>
      <Sommaire
        sections={[
          { id: "commandes", label: "Intégrer" },
          { id: "connexion", label: "Connexion au serveur" },
          { id: "agregateur-personnalise", label: "Agrégateur personnalisé" },
        ]}
      />
    </Coque>
  );
}
