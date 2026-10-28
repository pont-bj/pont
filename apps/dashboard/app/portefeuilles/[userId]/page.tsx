import Link from "next/link";
import { notFound } from "next/navigation";
import { gelerPortefeuille } from "@/app/actions";
import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { Carte, boutonDanger, boutonPlein } from "@/components/ui";
import { montant } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, getWallet } from "@/lib/pont";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const date = (ms: number) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));

export default async function Portefeuille({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requirePermission("portefeuille", "lire");
  const { userId } = await params;
  const overview = await getOverview();
  if (!overview.features.wallet) notFound();
  const detail = await getWallet(decodeURIComponent(userId)).catch(() => null);
  if (!detail) notFound();
  const { wallet, movements } = detail;
  const peutGeler = session.roles.can(session.user.role, "portefeuille", "debiter");
  return (
    <Coque actif="/portefeuilles" titre="Portefeuille" sansEntete {...propsCoque(session, overview)}>
      <nav aria-label="Fil d'Ariane" className="-mb-2 text-sm font-medium text-zinc-600">
        <Link href="/portefeuilles" className="hover:underline">
          Portefeuilles
        </Link>
        <span className="mx-2 text-zinc-400">/</span>
        <span aria-current="page">{wallet.userId}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{wallet.userId}</h1>
          {wallet.frozen && <span className="rounded-full bg-[#fef2f2] px-2.5 py-0.5 text-xs font-medium text-[#b91c1c]">Gelé</span>}
        </div>
        {peutGeler && (
          <form action={gelerPortefeuille}>
            <input type="hidden" name="userId" value={wallet.userId} />
            <input type="hidden" name="frozen" value={String(!wallet.frozen)} />
            <button className={wallet.frozen ? boutonPlein : boutonDanger}>{wallet.frozen ? "Dégeler le compte" : "Geler le compte"}</button>
          </form>
        )}
      </div>
      <Section id="soldes">
      <Carte className="grid divide-y divide-bordure py-5 md:grid-cols-3 md:divide-x md:divide-y-0">
        {[
          { label: "Disponible", valeur: montant(wallet.available, wallet.currency) },
          { label: "Bloqué (retraits en cours)", valeur: montant(wallet.held, wallet.currency) },
          { label: wallet.frozen ? "Palier KYC · compte gelé" : "Palier KYC", valeur: wallet.tier ?? "non défini" },
        ].map((carte) => (
          <div key={carte.label} className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
            <span className="text-sm text-zinc-500">{carte.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{carte.valeur}</span>
          </div>
        ))}
      </Carte>
      </Section>
      <section id="mouvements" className="scroll-mt-20 outline-none">
        <h2 className="mb-3 px-1 text-base font-medium">Mouvements du solde disponible</h2>
        <Carte className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td className="px-6 py-8 text-center text-zinc-500">Aucun mouvement.</td>
                </tr>
              )}
              {movements.map((movement, index) => (
                <tr key={`${movement.entryId}-${index}`} className={`h-12 ${index > 0 ? "border-t border-ligne" : ""}`}>
                  <td className="pl-6 text-zinc-400">{date(movement.createdAt)}</td>
                  <td className="font-mono text-xs text-zinc-400">{movement.entryId}</td>
                  <td className={`pr-6 text-right text-base font-medium tabular-nums ${movement.direction === "credit" ? "text-[#15803d]" : "text-[#b91c1c]"}`}>
                    {movement.direction === "credit" ? "+" : "−"} {montant(movement.amount, wallet.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      </section>
      <Sommaire
        sections={[
          { id: "soldes", label: "Soldes" },
          { id: "mouvements", label: "Mouvements" },
        ]}
      />
    </Coque>
  );
}
