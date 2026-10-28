import Link from "next/link";
import { Coque } from "@/components/coque";
import { ErreursPlugins } from "@/components/erreurs-plugins";
import { ListeLogos, Pays, ProviderLogo } from "@/components/logos";
import { Sommaire } from "@/components/sommaire";
import { boutonPlein } from "@/components/ui";
import { PontApiError, getCoverage, getOverview, getProvidersHealth, listProviders, type ProviderHealth } from "@/lib/pont";
import { estDegrade, nomOperateur, nomPays } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agrégateurs" };

const CAPACITES: Record<string, string> = { deposit: "Dépôts", payout: "Retraits", refund: "Remboursements" };

function etat(sante: ProviderHealth) {
  const heure = sante.lastHour;
  if (heure && estDegrade(sante)) return { label: "Dégradé", pastille: "bg-[#fffbeb] text-[#b45309]", point: "bg-[#d97706]", carte: "border-[#fde68a]", texte: `${Math.round(heure.rate * 100)} % de succès sur 1 h`, texteClasse: "text-[#92400e]" };
  if (heure) return { label: "Opérationnel", pastille: "bg-[#f0fdf4] text-[#15803d]", point: "bg-[#16a34a]", carte: "border-bordure", texte: `${Math.round(heure.rate * 100)} % de succès sur 1 h`, texteClasse: "text-zinc-600" };
  return { label: "Connecté", pastille: "bg-[#f4f4f5] text-[#52525b]", point: "bg-zinc-400", carte: "border-bordure", texte: "Aucun paiement réglé sur la dernière heure", texteClasse: "text-zinc-500" };
}

export default async function Agregateurs() {
  const session = await requirePermission("cles", "lire");
  const [overview, sante, couverture, cles] = await Promise.all([getOverview(), getProvidersHealth(), getCoverage(), listProviders().catch((e) => (e instanceof PontApiError ? null : Promise.reject(e)))]);
  const connectes = new Set(sante.map((s) => s.provider));
  const absents = (cles?.data ?? []).filter((provider) => !connectes.has(provider.id));
  // Libellés et marque « personnalisé » viennent du registre des clés (les plugins n'ont pas de nom connu du dashboard).
  const fiches = new Map((cles?.data ?? []).map((provider) => [provider.id, provider]));
  const erreursPlugins = cles?.pluginErrors ?? [];
  const autreConnecte = [...connectes].some((id) => id !== "kkiapay" && id !== "sandbox");
  const peutGerer = session.roles.can(session.user.role, "cles", "gerer");

  return (
    <Coque
      actif="/agregateurs"
      titre="Agrégateurs"
      texte="Vos clés restent sur votre serveur. Pont n'en reçoit aucune."
      action={peutGerer ? <Link href="/cles" className={boutonPlein}>+ Connecter un agrégateur</Link> : undefined}
      {...propsCoque(session, overview)}
    >
      {erreursPlugins.length > 0 && <ErreursPlugins erreurs={erreursPlugins} />}
      <div id="cartes" className="grid scroll-mt-20 items-start gap-4 outline-none sm:grid-cols-2 xl:grid-cols-4">
        {sante.map((s) => {
          const e = etat(s);
          return (
            <div key={s.provider} className={`flex flex-col gap-3 rounded-2xl border bg-white p-[18px] ${e.carte}`}>
              <div className="flex items-center gap-2">
                <h2 className="flex min-w-0 flex-1 items-center gap-2">
                  <ProviderLogo id={s.provider} label={fiches.get(s.provider)?.label} hauteur={20} />
                  {fiches.get(s.provider)?.custom && <Personnalise />}
                </h2>
                <span className={`inline-flex items-center gap-1.5 rounded-full py-[2px] pl-2 pr-2.5 text-xs font-medium ${e.pastille}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${e.point}`} />
                  {e.label}
                </span>
              </div>
              <p className={`text-sm ${e.texteClasse}`}>
                {e.texte}
                {s.needsReconciliation > 0 && ` · ${s.needsReconciliation} à réconcilier`}
              </p>
              <p className="text-xs text-zinc-400">
                {s.capabilities.map((c) => CAPACITES[c] ?? c).join(" · ") || "—"}
                <br />
                {s.countries} pays
              </p>
            </div>
          );
        })}
        {absents.map((provider) => {
          const exclu = provider.id === "kkiapay" && autreConnecte;
          return (
            <div key={provider.id} className="flex flex-col gap-3 rounded-2xl border border-bordure bg-fond-lateral p-[18px]">
              <div className="flex items-center gap-2">
                <h2 className="flex min-w-0 flex-1 items-center gap-2">
                  <ProviderLogo id={provider.id} label={provider.label} hauteur={20} grise />
                  {provider.custom && <Personnalise />}
                </h2>
                <span className="rounded-full bg-ligne px-2.5 py-0.5 text-xs font-medium text-zinc-600">Non connecté</span>
              </div>
              <p className="text-xs text-zinc-500">
                {exclu ? (
                  "Exclusif : incompatible avec vos autres agrégateurs (CGU Kkiapay, art. 18)."
                ) : peutGerer ? (
                  <Link href="/cles" className="font-medium text-indigo-fonce hover:underline">
                    Saisir les clés
                  </Link>
                ) : (
                  "Clés non renseignées."
                )}
              </p>
            </div>
          );
        })}
      </div>

      <section id="couverture" className="scroll-mt-20 rounded-2xl border border-bordure bg-white px-6 pb-2 pt-[18px] outline-none">
        <h2 className="text-base font-medium">Couverture</h2>
        <p className="mt-0.5 text-xs text-zinc-400">Ce que vos agrégateurs connectés permettent, par pays (capacités déclarées par les adaptateurs).</p>
        {couverture.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">Aucun agrégateur connecté : aucune couverture.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="text-xs font-medium text-zinc-400">
                <tr className="h-9">
                  <th className="w-44 pr-6 font-medium">Pays</th>
                  <th className="pr-6 font-medium">Opérateurs</th>
                  <th className="pr-6 font-medium">Dépôt via</th>
                  <th className="font-medium">Retrait via</th>
                </tr>
              </thead>
              <tbody>
                {couverture.map((ligne) => (
                  <tr key={ligne.country} className="h-11 border-t border-ligne text-sm">
                    <td className="pr-6 text-base font-medium">
                      <Pays code={ligne.country} />
                    </td>
                    <td className="pr-6 text-zinc-600">{[...new Set(ligne.operators.map((o) => nomOperateur(o, ligne.country).replace(` ${nomPays(ligne.country)}`, "")))].join(", ")}</td>
                    <td className="pr-6 text-zinc-600">
                      <ListeLogos ids={ligne.deposit} />
                    </td>
                    <td className="text-zinc-600">
                      <ListeLogos ids={ligne.payout} />
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
          { id: "cartes", label: "Agrégateurs" },
          { id: "couverture", label: "Couverture par pays" },
        ]}
      />
    </Coque>
  );
}

function Personnalise() {
  return <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-texte">Personnalisé</span>;
}
