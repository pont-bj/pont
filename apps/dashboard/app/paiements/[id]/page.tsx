import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Coque } from "@/components/coque";
import { Section } from "@/components/section";
import { Sommaire } from "@/components/sommaire";
import { FormulaireRemboursement } from "@/components/formulaire-remboursement";
import { Statut } from "@/components/statut";
import { Carte } from "@/components/ui";
import { montant, nomOperateur } from "@/lib/calculs";
import { CountryFlag, ProviderLogo } from "@/components/logos";
import { propsCoque } from "@/lib/page";
import { PontApiError, getOverview, getPaymentDetail } from "@/lib/pont";
import { requirePermission } from "@/lib/session";
import { rembourser } from "../../actions";

export const dynamic = "force-dynamic";

const POINT = { neutral: "bg-zinc-300", success: "bg-[#16a34a]", danger: "bg-[#dc2626]", info: "bg-indigo" } as const;
const heure = (ms: number) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(ms);
const dateComplete = (ms: number) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(ms);

export default async function PaiementDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("paiements", "lire");
  const { id } = await params;
  const overview = await getOverview();
  let detail;
  try {
    detail = await getPaymentDetail(id);
  } catch (error) {
    if (error instanceof PontApiError && error.status === 404) notFound();
    throw error;
  }
  const { payment, refunds, timeline } = detail;
  const rembourse = refunds.filter((r) => r.status !== "failed").reduce((somme, r) => somme + r.amount, 0);
  const restant = payment.amount - rembourse;
  const peutRembourser = (payment.status === "succeeded" || payment.status === "partially_refunded") && restant > 0 && session.roles.can(session.user.role, "paiements", "rembourser");
  const lignes: [string, ReactNode][] = [
    ["Identifiant", payment.id],
    ["Référence", payment.reference],
    [
      "Opérateur",
      <span key="operateur" className="inline-flex items-center gap-1.5">
        <CountryFlag code={payment.country} />
        {nomOperateur(payment.operator, payment.country)}
      </span>,
    ],
    [
      "Agrégateur",
      <span key="agregateur" className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <ProviderLogo id={payment.provider} hauteur={14} />
        {payment.providerRef && <span className="text-zinc-500">n° {payment.providerRef}</span>}
      </span>,
    ],
    ["Mode", payment.mode === "live" ? "Live" : "Test"],
    ...Object.entries(payment.metadata).map(([cle, valeur]): [string, ReactNode] => [`Métadonnée ${cle}`, valeur]),
  ];
  if (payment.failureCode) lignes.push(["Code d'échec", payment.failureCode]);

  return (
    <Coque actif="/paiements" titre="Paiement" sansEntete {...propsCoque(session, overview)}>
      <nav aria-label="Fil d'Ariane" className="-mb-2 text-sm font-medium text-zinc-600">
        <Link href="/paiements" className="hover:underline">
          Paiements
        </Link>
        <span className="mx-2 text-zinc-400">/</span>
        <span aria-current="page">{payment.reference}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-semibold tabular-nums">{montant(payment.amount, payment.currency)}</h1>
            <Statut status={payment.status} aReconcilier={payment.needsReconciliation} grand />
          </div>
          <p className="mt-1.5 text-base text-zinc-500">
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <CountryFlag code={payment.country} />
              {nomOperateur(payment.operator, payment.country)} · via <ProviderLogo id={payment.provider} hauteur={14} /> · {dateComplete(payment.createdAt)}
            </span>
          </p>
        </div>
        {peutRembourser && <FormulaireRemboursement action={rembourser} id={payment.id} devise={payment.currency} restant={restant} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Section id="chronologie">
        <Carte className="px-6 pb-4 pt-[22px]">
          <h2 className="text-base font-medium">Chronologie</h2>
          <ol className="mt-5">
            {timeline.map((etape, index) => (
              <li key={`${etape.at}-${index}`} className="flex gap-3.5">
                <div className="flex w-2.5 flex-col items-center pt-1">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${POINT[etape.tone]}`} />
                  {index < timeline.length - 1 && <span className="mt-1 w-[1.5px] flex-1 bg-bordure" />}
                </div>
                <div className={`flex min-w-0 flex-1 items-start gap-3 ${index < timeline.length - 1 ? "pb-[22px]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium">{etape.title}</p>
                    <p className="mt-[3px] break-words text-sm text-zinc-500">{etape.detail}</p>
                  </div>
                  <time dateTime={new Date(etape.at).toISOString()} className="shrink-0 text-xs text-zinc-400">
                    {heure(etape.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        </Carte>
        </Section>

        <Section id="details" className="self-start">
        <Carte className="flex flex-col gap-4 px-6 pb-6 pt-[22px]">
          <h2 className="text-base font-medium">Détails</h2>
          <dl className="flex flex-col gap-3.5">
            {lignes.map(([cle, valeur]) => (
              <div key={cle} className="flex gap-3 text-sm">
                <dt className="w-[130px] shrink-0 text-zinc-500">{cle}</dt>
                <dd className="min-w-0 break-words font-medium">{valeur}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-ligne pt-3.5">
            <h3 className="text-sm font-medium">Remboursements</h3>
            {refunds.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                Aucun.{payment.status === "succeeded" ? ` Remboursable jusqu'à ${montant(payment.amount, payment.currency)} ; frais d'agrégateur non rendus.` : ""}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {refunds.map((refund) => (
                  <li key={refund.id} className="flex justify-between gap-3">
                    <span className="text-zinc-500">{dateComplete(refund.createdAt)}</span>
                    <span className="font-medium tabular-nums">
                      {montant(refund.amount, refund.currency)} · {refund.status === "succeeded" ? "effectué" : refund.status === "failed" ? "échoué" : "en cours"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Carte>
        </Section>
      </div>
      <Sommaire
        sections={[
          { id: "chronologie", label: "Chronologie" },
          { id: "details", label: "Détails et remboursements" },
        ]}
      />
    </Coque>
  );
}
