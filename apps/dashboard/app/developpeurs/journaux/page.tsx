import { Coque } from "@/components/coque";
import { Vide } from "@/components/ui";
import { dateCourte } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, getWebhooks } from "@/lib/pont";
import { requirePermission } from "@/lib/session";
import { renvoyerLivraison } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journaux" };

const STATUT = {
  delivered: { label: "Livré", classes: "bg-[#f0fdf4] text-[#15803d]" },
  pending: { label: "En attente", classes: "bg-ligne text-zinc-600" },
  failed: { label: "Échec", classes: "bg-[#fef2f2] text-[#b91c1c]" },
} as const;

export default async function Journaux() {
  const session = await requirePermission("webhooks", "lire");
  const [overview, webhooks] = await Promise.all([getOverview(), getWebhooks()]);
  const peutGerer = webhooks.vault && session.roles.can(session.user.role, "webhooks", "gerer");
  const maintenant = Date.now();
  return (
    <Coque actif="/developpeurs/journaux" titre="Développeurs" {...propsCoque(session, overview)}>
      <p className="-mt-2 text-sm text-zinc-500">Les 50 dernières livraisons de webhooks vers votre application : événement, état, tentatives et dernière erreur.</p>
      {webhooks.deliveries.length === 0 ? (
        <Vide titre="Aucune livraison pour l'instant" texte="Chaque événement (paiement réussi, retrait terminé…) envoyé à vos destinataires apparaît ici, avec ses relances." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-bordure bg-white py-1">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-xs font-medium text-zinc-400">
              <tr className="h-9">
                <th className="pl-6 font-medium">Événement</th>
                <th className="font-medium">Destinataire</th>
                <th className="font-medium">État</th>
                <th className="text-right font-medium">Tentatives</th>
                <th className="pr-6 text-right font-medium">Créé</th>
                <th className="pr-6" />
              </tr>
            </thead>
            <tbody>
              {webhooks.deliveries.map((livraison) => {
                const statut = STATUT[livraison.status];
                return (
                  <tr key={livraison.id} className="h-14 border-t border-ligne">
                    <td className="pl-6 text-base font-medium">{livraison.eventType ?? "—"}</td>
                    <td className="max-w-60 truncate pr-4 text-sm text-zinc-500" title={livraison.url}>
                      {livraison.url}
                    </td>
                    <td className="pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statut.classes}`}>{statut.label}</span>
                      {livraison.lastError && <p className="mt-1 text-xs text-zinc-400">{livraison.lastError}</p>}
                      {!livraison.lastError && livraison.status === "failed" && livraison.lastHttpStatus && <p className="mt-1 text-xs text-zinc-400">HTTP {livraison.lastHttpStatus}</p>}
                    </td>
                    <td className="text-right text-sm tabular-nums">{livraison.attempts}</td>
                    <td className="whitespace-nowrap pr-6 text-right text-sm text-zinc-400">{dateCourte(livraison.createdAt, maintenant)}</td>
                    <td className="pr-6 text-right">
                      {peutGerer && livraison.status !== "delivered" && (
                        <form action={renvoyerLivraison}>
                          <input type="hidden" name="id" value={livraison.id} />
                          <button className="text-sm font-medium text-indigo-fonce hover:underline">Renvoyer</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Coque>
  );
}
