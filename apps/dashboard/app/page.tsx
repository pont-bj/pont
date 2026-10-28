import Link from "next/link";
import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { PaysEtAgregateur } from "@/components/logos";
import { Ligne, Tableau } from "@/components/lignes";
import { PaiementTest } from "@/components/paiement-test";
import { Statut } from "@/components/statut";
import { Alerte, Carte, Vide } from "@/components/ui";
import { dateCourte, ilYA, montant, nomOperateur, nombre, volumeParJour } from "@/lib/calculs";
import { propsCoque } from "@/lib/page";
import { getOverview, listPayments, listPayouts } from "@/lib/pont";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vue d'ensemble" };

const REGLES = new Set(["failed", "expired", "cancelled"]);

/** Montants par devise : « 2 450 000 XOF », ou « … · … XAF » si les deux existent. */
function parDevise(lignes: { amount: number; currency: string }[]): string {
  const totaux = new Map<string, number>();
  for (const ligne of lignes) totaux.set(ligne.currency, (totaux.get(ligne.currency) ?? 0) + ligne.amount);
  if (totaux.size === 0) return "0 XOF";
  return [...totaux].map(([devise, total]) => montant(total, devise)).join(" · ");
}

export default async function Apercu() {
  const session = await requirePermission("paiements", "lire");
  const [overview, paiements, retraits] = await Promise.all([getOverview(), listPayments(200), listPayouts(200)]);
  const maintenant = Date.now();
  const reussis = paiements.filter((p) => p.status === "succeeded");
  const regles = paiements.filter((p) => p.status === "succeeded" || REGLES.has(p.status));
  const taux = regles.length === 0 ? null : (reussis.length / regles.length) * 100;
  const retraitsEnvoyes = retraits.filter((r) => r.status === "succeeded");
  const retraitsEchoues = retraits.filter((r) => r.status === "failed").length;
  const aReconcilier = paiements.filter((p) => p.needsReconciliation && p.status !== "succeeded").length + retraits.filter((r) => r.needsReconciliation && r.status !== "succeeded").length;
  const barres = volumeParJour(paiements, maintenant);
  const maximum = Math.max(...barres.map((barre) => barre.volume), 1);
  const jour = (debut: number) => new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(debut).replace(".", "");
  const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);
  const peutTester = overview.sandbox && session.roles.can(session.user.role, "paiements", "creer");

  return (
    <Coque actif="/" titre="Vue d'ensemble" texte={paiements.length > 0 ? `Calculé sur ${nombre(paiements.length)} paiement${paiements.length > 1 ? "s" : ""} (les 200 derniers au maximum).` : undefined} action={peutTester ? <PaiementTest /> : undefined} {...propsCoque(session, overview)}>
      {aReconcilier > 0 && (
        <Alerte action={{ href: "/paiements?statut=reconcilier", label: "Voir" }}>
          {aReconcilier} opération{aReconcilier > 1 ? "s" : ""} à réconcilier. Pont les revérifie automatiquement, ne les relancez pas.
        </Alerte>
      )}

      <Section id="indicateurs">
      <Carte className="grid divide-y divide-bordure py-5 md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
          <span className="text-sm text-zinc-500">Encaissé</span>
          <span className="text-3xl font-semibold tabular-nums">{parDevise(reussis)}</span>
          <span className="text-xs text-zinc-500">{reussis.length > 0 ? `${nombre(reussis.length)} paiement${reussis.length > 1 ? "s" : ""} réussi${reussis.length > 1 ? "s" : ""}` : "Aucun paiement réussi"}</span>
        </div>
        <div className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
          <span className="text-sm text-zinc-500">Taux de succès</span>
          <span className="text-3xl font-semibold tabular-nums">{taux === null ? "—" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(taux)} %`}</span>
          <span className="text-xs text-zinc-500">{taux === null ? "Aucun paiement réglé" : `${nombre(reussis.length)} réussis sur ${nombre(regles.length)} réglés`}</span>
        </div>
        <div className="flex flex-col gap-1.5 px-6 py-2 md:py-0">
          <span className="text-sm text-zinc-500">Retraits</span>
          <span className="text-3xl font-semibold tabular-nums">{parDevise(retraitsEnvoyes)}</span>
          <span className="text-xs text-zinc-500">
            {nombre(retraitsEnvoyes.length)} envoi{retraitsEnvoyes.length > 1 ? "s" : ""} · {retraitsEchoues === 0 ? "aucun échec" : `${retraitsEchoues} échec${retraitsEchoues > 1 ? "s" : ""}`}
          </span>
        </div>
      </Carte>
      </Section>

      <Section id="volume">
      <Carte className="px-6 pb-4 pt-5">
        <h2 className="text-base font-medium">Volume encaissé</h2>
        <p className="mt-0.5 text-xs text-zinc-400">7 derniers jours, paiements réussis uniquement.</p>
        <div className="mt-5 flex h-[140px] items-end gap-3 sm:gap-6" role="img" aria-label={`Volume encaissé par jour : ${barres.map((b) => `${jour(b.debut)} ${nombre(b.volume)}`).join(", ")}`}>
          {barres.map((barre, index) => (
            <div key={barre.debut} title={`${majuscule(jour(barre.debut))} · ${nombre(barre.volume)}`} className={`flex-1 rounded-[3px] ${index === barres.length - 1 ? "bg-indigo" : "bg-indigo-100"}`} style={{ height: Math.max(4, Math.round((barre.volume / maximum) * 136)) }} />
          ))}
        </div>
        <div className="mt-5 flex gap-3 text-xs text-zinc-400 sm:gap-6">
          {barres.map((barre, index) => (
            <span key={barre.debut} className={`flex-1 truncate ${index === barres.length - 1 ? "font-medium text-indigo-texte" : ""}`}>
              {index === barres.length - 1 ? `Auj. · ${nombre(barre.volume)}` : majuscule(jour(barre.debut))}
            </span>
          ))}
        </div>
      </Carte>
      </Section>

      <section id="derniers" className="scroll-mt-20 outline-none">
        <div className="mb-3 flex items-center px-1">
          <h2 className="flex-1 text-base font-medium">Derniers paiements</h2>
          <Link href="/paiements" className="text-sm font-medium text-indigo-fonce hover:underline">
            Tout voir
          </Link>
        </div>
        {paiements.length === 0 ? (
          <Vide titre="Aucun paiement pour l'instant" texte={overview.sandbox ? "Lancez un paiement de test pour voir le flux complet, de la création à la notification." : "Les paiements créés par votre application apparaissent ici."} />
        ) : (
          <Tableau entetes={["Client", "Référence", "Montant", "Statut", "Date"]}>
            {paiements.slice(0, 5).map((paiement) => (
              <Ligne
                key={paiement.id}
                href={`/paiements/${paiement.id}`}
                principal={nomOperateur(paiement.operator, paiement.country)}
                secondaire={<PaysEtAgregateur code={paiement.country} provider={paiement.provider} />}
                reference={paiement.reference}
                montant={montant(paiement.amount, paiement.currency)}
                statut={<Statut status={paiement.status} aReconcilier={paiement.needsReconciliation} />}
                date={ilYA(paiement.updatedAt, maintenant)}
              />
            ))}
          </Tableau>
        )}
      </section>
      <Sommaire
        sections={[
          { id: "indicateurs", label: "Indicateurs" },
          { id: "volume", label: "Volume encaissé" },
          { id: "derniers", label: "Derniers paiements" },
        ]}
      />
    </Coque>
  );
}
