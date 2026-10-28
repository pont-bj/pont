import { montant } from "@/lib/calculs";
import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { Indisponible } from "@/components/indisponible";
import { Carte, Vide } from "@/components/ui";
import { propsCoque } from "@/lib/page";
import { getLedger, getOverview } from "@/lib/pont";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const date = (ms: number) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(ms));

const LIBELLES: Record<string, string> = { transit: "Fonds chez l'agrégateur", fees: "Frais perçus" };

/** `system:transit:fedapay:XOF` → « Fonds chez l'agrégateur · fedapay ». */
function libelleCompte(code: string): string {
  const [, kind, ...rest] = code.split(":");
  const detail = rest.slice(0, -1).filter(Boolean).join(" ");
  return `${LIBELLES[kind ?? ""] ?? code}${detail ? ` · ${detail}` : ""}`;
}

export default async function Registre() {
  const session = await requirePermission("registre", "lire");
  const overview = await getOverview();
  const ledger = overview.features.wallet ? await getLedger() : null;
  return (
    <Coque actif="/registre" titre="Registre comptable" texte="Écritures en partie double : immuables, équilibrées, sans découvert." {...propsCoque(session, overview)}>
      {!ledger ? (
        <Indisponible titre="Le registre" />
      ) : (
        <>
          {ledger.system.length === 0 ? (
            <Vide titre="Aucun compte système pour l'instant" />
          ) : (
            <Section id="comptes">
            <Carte className="grid divide-y divide-bordure py-5 md:grid-flow-col md:auto-cols-fr md:divide-x md:divide-y-0">
              {ledger.system.map((account) => (
                <div key={account.code} className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
                  <span className="text-sm text-zinc-500">{libelleCompte(account.code)}</span>
                  <span className="text-2xl font-semibold tabular-nums">{montant(account.balance, account.currency)}</span>
                </div>
              ))}
            </Carte>
            </Section>
          )}
          <section id="ecritures" className="flex scroll-mt-20 flex-col gap-3 outline-none">
            <h2 className="px-1 text-base font-medium">Dernières écritures</h2>
            {ledger.entries.length === 0 && <Vide titre="Aucune écriture" />}
            {ledger.entries.map((entry) => (
              <Carte key={entry.id} className="px-6 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base font-medium">{entry.description}</p>
                  <p className="text-xs text-zinc-400">{date(entry.createdAt)}</p>
                </div>
                <table className="mt-2 w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-400">
                      <th className="w-1/2 py-1 font-medium">Compte</th>
                      <th className="py-1 text-right font-medium">Débit</th>
                      <th className="py-1 text-right font-medium">Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line, index) => (
                      <tr key={index} className="text-zinc-600">
                        <td className="truncate py-0.5 font-mono text-xs">{line.account}</td>
                        <td className="py-0.5 text-right tabular-nums">{line.direction === "debit" ? montant(line.amount, ledger.currency) : ""}</td>
                        <td className="py-0.5 text-right tabular-nums">{line.direction === "credit" ? montant(line.amount, ledger.currency) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Carte>
            ))}
          </section>
          <Sommaire
            sections={[
              { id: "comptes", label: "Comptes système" },
              { id: "ecritures", label: "Dernières écritures" },
            ]}
          />
        </>
      )}
    </Coque>
  );
}
