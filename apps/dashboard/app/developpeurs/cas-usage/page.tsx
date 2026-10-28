import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { propsCoque } from "@/lib/page";
import { getOverview } from "@/lib/pont";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cas d'usage" };

interface Recette {
  nom: string;
  texte: string;
  modules: string;
  etat: "recette" | "bientot" | "dispo";
  commande?: string;
}

// État réel du produit : seule la recette « portefeuille » existe ; le paiement de factures est le socle (`pont init`).
const RECETTES: Recette[] = [
  { nom: "Portefeuille mobile", texte: "Comptes utilisateurs, dépôts, retraits, transferts, frais et plafonds par palier KYC.", modules: "ledger · wallets · limits · fees · payments · payouts", etat: "recette", commande: "npx pont add recipe wallet" },
  { nom: "Tontine", texte: "Cotisations périodiques, tours de versement, rappels et pénalités de retard.", modules: "wallets · schedules · ledger · payments · payouts", etat: "bientot" },
  { nom: "Marketplace avec séquestre", texte: "Paiement bloqué jusqu'à la livraison, commission, versement aux vendeurs.", modules: "payments · escrow · fees · payouts", etat: "bientot" },
  { nom: "Microcrédit", texte: "Décaissement, échéancier, remboursements et relances.", modules: "customers · limits · payouts · schedules · ledger", etat: "bientot" },
  { nom: "Cagnotte", texte: "Collecte ouverte à tous, objectif, versement au bénéficiaire.", modules: "payments · wallets · payouts", etat: "bientot" },
  { nom: "Paiement de factures", texte: "Encaissement et remboursement simples : ce que Pont fait déjà.", modules: "payments · refunds", etat: "dispo", commande: "npx pont init" },
];

const PASTILLE = {
  recette: { label: "Première recette", classes: "bg-indigo-100 text-indigo-fonce" },
  bientot: { label: "Bientôt", classes: "bg-ligne text-zinc-600" },
  dispo: { label: "Disponible", classes: "bg-[#f0fdf4] text-[#15803d]" },
};

export default async function CasUsage() {
  const session = await requireSession();
  const overview = await getOverview();
  return (
    <Coque actif="/developpeurs/cas-usage" titre="Développeurs" {...propsCoque(session, overview)}>
      <p className="-mt-2 text-sm text-zinc-500">Partez d'un cas d'usage : Pont installe les modules, génère l'intégration et les tests. Décrivez votre fintech à votre agent IA, il choisira la bonne recette.</p>
      {[
        { id: "disponibles", titre: "Disponibles", liste: RECETTES.filter((recette) => recette.etat !== "bientot") },
        { id: "bientot", titre: "Bientôt", liste: RECETTES.filter((recette) => recette.etat === "bientot") },
      ].map(({ id, titre, liste }) => (
        <Section key={id} id={id}>
          <h2 className="mb-3 px-1 text-base font-medium">{titre}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {liste.map((recette) => {
              const pastille = PASTILLE[recette.etat];
              return (
            <article key={recette.nom} className={`flex flex-col gap-2.5 rounded-2xl border bg-white px-5 pb-5 pt-[18px] ${recette.etat === "recette" ? "border-indigo-100" : "border-bordure"}`}>
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-base font-medium">{recette.nom}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pastille.classes}`}>{pastille.label}</span>
              </div>
              <p className="text-sm text-zinc-500">{recette.texte}</p>
              <p className="text-xs text-zinc-400">{recette.modules}</p>
              {recette.commande && <code className="mt-auto rounded-lg bg-ligne px-3 py-2 font-sans text-sm text-zinc-700">{recette.commande}</code>}
            </article>
              );
            })}
          </div>
        </Section>
      ))}
      <Sommaire
        sections={[
          { id: "disponibles", label: "Disponibles" },
          { id: "bientot", label: "Bientôt" },
        ]}
      />
    </Coque>
  );
}
