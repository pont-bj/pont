import Link from "next/link";
import { Coque } from "@/components/coque";
import { PaysEtAgregateur } from "@/components/logos";
import { IconeChevronBas } from "@/components/icones";
import { Ligne, Tableau } from "@/components/lignes";
import { PaiementTest } from "@/components/paiement-test";
import { Statut } from "@/components/statut";
import { bouton, Vide } from "@/components/ui";
import { FILTRES_STATUT, compter, correspond, dateCourte, estFiltre, montant, nomAgregateur, nomOperateur, nombre, pagePositive, type FiltreStatut } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, listPayments } from "@/lib/pont";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paiements" };

const PAR_PAGE = 10;
const ONGLETS: { id: FiltreStatut; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "reussis", label: "Réussis" },
  { id: "attente", label: "En attente" },
  { id: "echoues", label: "Échoués" },
  { id: "reconcilier", label: "À réconcilier" },
];

type Params = { statut?: string; agregateur?: string; page?: string };

const lienVers = (params: Params, changements: Partial<Params>) => {
  const fusion = { ...params, ...changements };
  const requete = new URLSearchParams();
  if (fusion.statut && fusion.statut !== "tous") requete.set("statut", fusion.statut);
  if (fusion.agregateur) requete.set("agregateur", fusion.agregateur);
  if (fusion.page && fusion.page !== "1") requete.set("page", fusion.page);
  const texte = requete.toString();
  return texte ? `/paiements?${texte}` : "/paiements";
};

export default async function Paiements({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requirePermission("paiements", "lire");
  const params = await searchParams;
  const [overview, tous] = await Promise.all([getOverview(), listPayments(200)]);
  const maintenant = Date.now();
  const filtre: FiltreStatut = estFiltre(params.statut) ? params.statut : "tous";
  const agregateurs = [...new Set(tous.map((paiement) => paiement.provider))].sort();
  const agregateur = params.agregateur && agregateurs.includes(params.agregateur) ? params.agregateur : "";
  const pool = agregateur ? tous.filter((paiement) => paiement.provider === agregateur) : tous;
  const comptes = compter(pool);
  const filtres = pool.filter((paiement) => correspond(paiement, filtre));
  const pages = Math.max(1, Math.ceil(filtres.length / PAR_PAGE));
  const page = Math.min(pagePositive(params.page), pages);
  const visibles = filtres.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
  const exportHref = `/paiements/export${filtre !== "tous" || agregateur ? `?${new URLSearchParams({ ...(filtre !== "tous" ? { statut: filtre } : {}), ...(agregateur ? { agregateur } : {}) })}` : ""}`;
  const peutTester = overview.sandbox && session.roles.can(session.user.role, "paiements", "creer");

  return (
    <Coque
      actif="/paiements"
      titre="Paiements"
      texte={tous.length === 200 ? "Les 200 paiements les plus récents." : undefined}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {peutTester && <PaiementTest />}
          <a href={exportHref} className={bouton} download>
            Exporter CSV
          </a>
        </div>
      }
      {...propsCoque(session, overview)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filtrer par statut" className="inline-flex gap-0.5 overflow-x-auto rounded-lg bg-ligne p-[3px]">
          {ONGLETS.map((onglet) => {
            const actif = onglet.id === filtre;
            return (
              <Link
                key={onglet.id}
                href={lienVers(params, { statut: onglet.id, page: "1" })}
                role="tab"
                aria-selected={actif}
                className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition ${actif ? "bg-white text-encre shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-zinc-500 hover:text-zinc-800"}`}
              >
                {onglet.label}
                {onglet.id === "reconcilier" ? (
                  comptes.reconcilier > 0 && <span className="rounded-full bg-[#fffbeb] px-1.5 text-[11px] font-semibold leading-[14px] text-[#b45309]">{comptes.reconcilier}</span>
                ) : (
                  actif && <span className="text-xs font-normal text-zinc-400">{nombre(comptes[onglet.id])}</span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex-1" />
        <form className="relative" action="/paiements">
          {filtre !== "tous" && <input type="hidden" name="statut" value={filtre} />}
          <select
            name="agregateur"
            defaultValue={agregateur}
            aria-label="Filtrer par agrégateur"
            className="h-8 appearance-none rounded-lg border border-bordure bg-white py-0 pl-3 pr-8 text-sm font-medium text-zinc-600 outline-none focus:border-indigo focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">Tous les agrégateurs</option>
            {agregateurs.map((id) => (
              <option key={id} value={id}>
                {nomAgregateur(id)}
              </option>
            ))}
          </select>
          <IconeChevronBas className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <noscript>
            <button className={bouton}>Filtrer</button>
          </noscript>
          <button className="sr-only">Appliquer</button>
        </form>
      </div>

      {filtres.length === 0 ? (
        <Vide
          titre={tous.length === 0 ? "Aucun paiement pour l'instant" : "Aucun paiement ne correspond à ce filtre"}
          texte={tous.length === 0 ? (overview.sandbox ? "Lancez un paiement de test pour voir le flux complet." : "Les paiements créés par votre application apparaissent ici.") : undefined}
          action={tous.length > 0 ? { href: "/paiements", label: "Retirer les filtres" } : undefined}
        />
      ) : (
        <Tableau
          entetes={["Client", "Référence", "Montant", "Statut", "Date"]}
          pied={
            <div className="flex items-center gap-3 border-t border-ligne px-6 pb-2 pt-3 text-sm text-zinc-500">
              <span className="flex-1">
                {(page - 1) * PAR_PAGE + 1}–{(page - 1) * PAR_PAGE + visibles.length} sur {nombre(filtres.length)}
              </span>
              {page > 1 ? (
                <Link href={lienVers(params, { page: String(page - 1) })} className={`${bouton} h-8 px-3`}>
                  Précédent
                </Link>
              ) : (
                <span className={`${bouton} h-8 px-3 opacity-50`}>Précédent</span>
              )}
              {page < pages ? (
                <Link href={lienVers(params, { page: String(page + 1) })} className={`${bouton} h-8 px-3`}>
                  Suivant
                </Link>
              ) : (
                <span className={`${bouton} h-8 px-3 opacity-50`}>Suivant</span>
              )}
            </div>
          }
        >
          {visibles.map((paiement) => (
            <Ligne
              key={paiement.id}
              href={`/paiements/${paiement.id}`}
              principal={nomOperateur(paiement.operator, paiement.country)}
              secondaire={<PaysEtAgregateur code={paiement.country} provider={paiement.provider} />}
              reference={paiement.reference}
              montant={montant(paiement.amount, paiement.currency)}
              statut={<Statut status={paiement.status} aReconcilier={paiement.needsReconciliation} />}
              date={dateCourte(paiement.createdAt, maintenant)}
            />
          ))}
        </Tableau>
      )}
    </Coque>
  );
}
