import Link from "next/link";
import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { FormulaireAlertes } from "@/components/formulaire-alertes";
import { getAlerts, getShell } from "@/lib/pont";
import { propsCoque } from "@/lib/page";
import { requirePermission } from "@/lib/session";
import { enregistrerAlertes, envoyerAlerteTest } from "../actions";

export const dynamic = "force-dynamic";

const date = (valeur: number) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(valeur);

export default async function Alertes() {
  const session = await requirePermission("parametres", "lire");
  const [shell, alertes] = await Promise.all([getShell(), getAlerts().catch(() => null)]);
  const peutGerer = Boolean(alertes) && session.roles.can(session.user.role, "parametres", "gerer");
  return (
    <Coque actif="/alertes" titre="Paramètres" {...propsCoque(session, shell)}>
      <p className="-mt-2 text-sm text-zinc-500">Un seul e-mail récapitulatif par vérification, jamais deux fois la même alerte.</p>
      {!alertes ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">Le coffre est désactivé : ajoutez <code className="rounded bg-white px-1.5 py-0.5">PONT_ENCRYPTION_KEY</code> à la configuration du serveur.</p>
      ) : (
        <>
          {!alertes.emailConfigured && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              Aucun SMTP configuré : les alertes restent en attente. <Link href="/email" className="underline">Configurer l'e-mail</Link>
            </p>
          )}
          <Section id="regles">
            <FormulaireAlertes alertes={alertes} enregistrer={enregistrerAlertes} tester={envoyerAlerteTest} peutGerer={peutGerer} />
          </Section>
          <section id="historique" className="scroll-mt-20 outline-none">
            <h2 className="mb-3 text-lg font-semibold">Historique</h2>
            {alertes.history.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-bordure bg-white px-6 py-8 text-center text-sm text-zinc-500">Aucune alerte envoyée pour l'instant.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-bordure bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-bordure text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Alerte</th>
                      <th className="px-4 py-3 font-medium">Détail</th>
                      <th className="px-4 py-3 font-medium">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bordure">
                    {alertes.history.map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{date(entry.at)}</td>
                        <td className="px-4 py-3 font-medium">{entry.title}</td>
                        <td className="px-4 py-3 text-zinc-600">{entry.detail}</td>
                        <td className="px-4 py-3">
                          {entry.status === "sent" ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Envoyée</span>
                          ) : (
                            <span title={entry.error} className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Échec</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <Sommaire
            sections={[
              { id: "regles", label: "Règles d'alerte" },
              { id: "historique", label: "Historique" },
            ]}
          />
        </>
      )}
    </Coque>
  );
}
