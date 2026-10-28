import Link from "next/link";
import { Coque } from "@/components/coque";
import { Indisponible } from "@/components/indisponible";
import { Carte, Vide } from "@/components/ui";
import { montant, nombre } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, listWallets } from "@/lib/pont";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portefeuilles" };

export default async function Portefeuilles() {
  const session = await requirePermission("portefeuille", "lire");
  const overview = await getOverview();
  const wallets = overview.features.wallet ? await listWallets() : [];
  const total = wallets.reduce((somme, wallet) => somme + wallet.available + wallet.held, 0);
  return (
    <Coque actif="/portefeuilles" titre="Portefeuilles" texte={overview.features.wallet ? `${nombre(wallets.length)} portefeuille${wallets.length > 1 ? "s" : ""}, ${montant(total, "XOF")} détenus pour vos utilisateurs.` : undefined} {...propsCoque(session, overview)}>
      {!overview.features.wallet ? (
        <Indisponible titre="Le portefeuille" />
      ) : wallets.length === 0 ? (
        <Vide titre="Aucun portefeuille" texte={<>Ils se créent quand votre application appelle <code>PUT /v1/wallets/&lt;utilisateur&gt;</code>.</>} />
      ) : (
        <Carte className="overflow-x-auto py-1">
          <table className="w-full min-w-[640px] text-left">
            <thead className="text-xs font-medium text-zinc-400">
              <tr className="h-9">
                <th className="pl-6 font-medium">Utilisateur</th>
                <th className="text-right font-medium">Disponible</th>
                <th className="text-right font-medium">Bloqué</th>
                <th className="pl-6 font-medium">Palier KYC</th>
                <th className="pr-6 font-medium">État</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <tr key={wallet.userId} className="h-14 border-t border-ligne">
                  <td className="pl-6 text-base font-medium">
                    <Link href={`/portefeuilles/${encodeURIComponent(wallet.userId)}`} className="text-indigo-fonce hover:underline">
                      {wallet.userId}
                    </Link>
                  </td>
                  <td className="text-right text-base font-medium tabular-nums">{montant(wallet.available, wallet.currency)}</td>
                  <td className="text-right text-sm tabular-nums text-zinc-500">{montant(wallet.held, wallet.currency)}</td>
                  <td className="pl-6 text-sm">{wallet.tier ?? <span className="text-zinc-400">non défini</span>}</td>
                  <td className="pr-6">
                    {wallet.frozen ? (
                      <span className="rounded-full bg-[#fef2f2] px-2.5 py-0.5 text-xs font-medium text-[#b91c1c]">Gelé</span>
                    ) : (
                      <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-medium text-[#15803d]">Actif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      )}
    </Coque>
  );
}
