import Link from "next/link";
import { AvertissementUrlPublique } from "@/components/avertissement-url";
import { BoutonCopier } from "@/components/bouton-copier";
import { Coque } from "@/components/coque";
import { FormulaireDestinataire } from "@/components/formulaire-destinataire";
import { Sommaire } from "@/components/sommaire";
import { Carte, CarteEntete, Vide } from "@/components/ui";
import { dateCourte } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getShell, getWebhooks } from "@/lib/pont";
import { requirePermission } from "@/lib/session";
import { ajouterDestinataire, supprimerDestinataire } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Webhooks" };

export default async function Webhooks() {
  const session = await requirePermission("webhooks", "lire");
  const [shell, webhooks] = await Promise.all([getShell(), getWebhooks()]);
  const peutGerer = webhooks.vault && session.roles.can(session.user.role, "webhooks", "gerer");
  const maintenant = Date.now();
  return (
    <Coque actif="/webhooks" titre="Développeurs" {...propsCoque(session, shell)}>
      <AvertissementUrlPublique adresse={webhooks.inbound[0]?.url.replace(/\/hooks\/[^/]+$/, "") ?? null} />
      <Carte className="scroll-mt-20 pb-1 outline-none" id="recus">
        <CarteEntete titre="Reçus des agrégateurs" texte="À déclarer dans le tableau de bord de chaque agrégateur. Pont vérifie la signature avant d'accepter un événement." />
        <ul>
          {webhooks.inbound.map((hook) => (
            <li key={hook.provider} className="flex items-center gap-6 border-t border-ligne px-6 py-[13px] text-sm">
              <span className="w-[180px] shrink-0 capitalize text-zinc-500">{hook.provider}</span>
              <code className="min-w-0 flex-1 truncate font-sans font-medium">{hook.url}</code>
              <BoutonCopier texte={hook.url} />
            </li>
          ))}
        </ul>
      </Carte>

      <section id="destinataires" className="flex scroll-mt-20 flex-col gap-4 outline-none">
        <div>
          <h2 className="text-base font-medium">Envoyés à votre application</h2>
          {!webhooks.vault && (
            <p className="mt-1 text-xs text-zinc-400">
              Sans <code>PONT_ENCRYPTION_KEY</code>, seul le destinataire défini par <code>PONT_WEBHOOK_URL</code> est possible.
            </p>
          )}
        </div>
        {peutGerer && <FormulaireDestinataire action={ajouterDestinataire} />}
        {webhooks.endpoints.length === 0 ? (
          <Vide titre="Aucun destinataire" texte="Vos événements ne sont envoyés nulle part. Ajoutez l'adresse de votre application." />
        ) : (
          <Carte>
            <ul>
              {webhooks.endpoints.map((endpoint, index) => (
                <li key={endpoint.id} className={`flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-[13px] text-sm ${index > 0 ? "border-t border-ligne" : ""}`}>
                  <code className="min-w-0 flex-1 break-all font-sans font-medium">{endpoint.url}</code>
                  <span className="text-zinc-400">{endpoint.source === "env" ? "variables d'environnement" : `ajouté ${dateCourte(endpoint.createdAt ?? 0, maintenant).toLowerCase()}`}</span>
                  {peutGerer && endpoint.source === "vault" && (
                    <form action={supprimerDestinataire}>
                      <input type="hidden" name="id" value={endpoint.id} />
                      <button className="font-medium text-red-700 hover:underline">Retirer</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Carte>
        )}
        <p className="text-sm text-zinc-500">
          L'historique des livraisons et le renvoi sont dans{" "}
          <Link href="/developpeurs/journaux" className="font-medium text-indigo-fonce hover:underline">
            Journaux
          </Link>
          .
        </p>
      </section>
      <Sommaire
        sections={[
          { id: "recus", label: "Reçus des agrégateurs" },
          { id: "destinataires", label: "Envoyés à votre application" },
        ]}
      />
    </Coque>
  );
}
