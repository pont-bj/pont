import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { PaysEtAgregateur, ProviderLogo } from "@/components/logos";
import { Ligne, Tableau } from "@/components/lignes";
import { Statut } from "@/components/statut";
import { Carte, Vide } from "@/components/ui";
import { dateCourte, montant, nomOperateur, nombre } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, listPayouts } from "@/lib/pont";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Retraits" };

function parDevise(lignes: { amount: number; currency: string }[]): string {
  const totaux = new Map<string, number>();
  for (const ligne of lignes) totaux.set(ligne.currency, (totaux.get(ligne.currency) ?? 0) + ligne.amount);
  return totaux.size === 0 ? "0 XOF" : [...totaux].map(([devise, total]) => montant(total, devise)).join(" · ");
}

export default async function Retraits() {
  const session = await requirePermission("paiements", "lire");
  const [overview, retraits] = await Promise.all([getOverview(), listPayouts(100)]);
  const maintenant = Date.now();
  const envoyes = retraits.filter((r) => r.status === "succeeded");
  const enCours = retraits.filter((r) => r.status === "pending" || r.status === "processing");
  const echoues = retraits.filter((r) => r.status === "failed");

  return (
    <Coque actif="/retraits" titre="Retraits" texte="Exécutés par votre serveur, avec vos clés, après votre confirmation." {...propsCoque(session, overview)}>
      {retraits.length > 0 && (
        <Section id="indicateurs">
        <Carte className="grid divide-y divide-bordure py-5 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
            <span className="text-sm text-zinc-500">Envoyé</span>
            <span className="text-2xl font-semibold tabular-nums">{parDevise(envoyes)}</span>
            <span className="text-xs text-zinc-500">{nombre(envoyes.length)} retrait{envoyes.length > 1 ? "s" : ""}</span>
          </div>
          <div className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
            <span className="text-sm text-zinc-500">En cours</span>
            <span className="text-2xl font-semibold tabular-nums">{parDevise(enCours)}</span>
            <span className="text-xs text-zinc-500">{nombre(enCours.length)} retrait{enCours.length > 1 ? "s" : ""}</span>
          </div>
          <div className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
            <span className="text-sm text-zinc-500">Échoué</span>
            <span className="text-2xl font-semibold tabular-nums">{nombre(echoues.length)}</span>
            <span className="text-xs text-zinc-500">{echoues.length === 0 ? "Aucun échec" : "Fonds non débités"}</span>
          </div>
        </Carte>
        </Section>
      )}

      {retraits.length === 0 ? (
        <Vide titre="Aucun retrait pour l'instant" texte="Les retraits créés par votre application (POST /v1/payouts) ou par un workflow de portefeuille apparaissent ici." />
      ) : (
        <Section id="liste">
        <Tableau entetes={["Bénéficiaire", "Référence", "Montant", "Statut", "Date"]}>
          {retraits.map((retrait) => (
            <Ligne
              key={retrait.id}
              principal={nomOperateur(retrait.operator, retrait.country)}
              secondaire={
                retrait.failureCode ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <ProviderLogo id={retrait.provider} hauteur={11} /> <span aria-hidden>·</span> <span className="truncate">{retrait.failureCode.replace(/_/g, " ")}</span>
                  </span>
                ) : (
                  <PaysEtAgregateur code={retrait.country} provider={retrait.provider} />
                )
              }
              ton={retrait.status === "failed" ? "erreur" : "normal"}
              reference={retrait.reference}
              montant={montant(retrait.amount, retrait.currency)}
              statut={<Statut status={retrait.status} aReconcilier={retrait.needsReconciliation} retrait />}
              date={dateCourte(retrait.createdAt, maintenant)}
            />
          ))}
        </Tableau>
        </Section>
      )}
      {retraits.length > 0 && (
        <Sommaire
        sections={[
          { id: "indicateurs", label: "Indicateurs" },
          { id: "liste", label: "Retraits" },
        ]}
        />
      )}
    </Coque>
  );
}
