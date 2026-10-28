import type { Capability, Country, Operator, Payment, ProviderAdapter } from "@pont/core";
import type { Delivery, RefundStore } from "@pont/engine";

const COUNTRIES: Country[] = ["BJ", "TG", "CI", "SN", "BF", "ML", "NE", "GN", "CM", "CG", "CD", "GA"];
const OPERATORS: Operator[] = [
  "mtn_bj", "moov_bj", "celtiis_bj", "moov_tg", "tmoney_tg",
  "mtn_ci", "orange_ci", "moov_ci", "wave_ci",
  "orange_sn", "free_sn", "wave_sn", "expresso_sn", "wizall_sn",
  "orange_bf", "moov_bf", "orange_ml", "moov_ml",
  "mtn_cm", "orange_cm", "mtn_cg", "airtel_cg", "airtel_ga",
];

const operatorCountry = (operator: Operator): Country => operator.slice(operator.lastIndexOf("_") + 1).toUpperCase() as Country;

export interface CoverageCountry {
  country: Country;
  operators: Operator[];
  deposit: string[];
  payout: string[];
  refund: string[];
}

/** Ce que les agrégateurs configurés permettent, par pays (capacités déclarées par les adaptateurs, aucun appel réseau). */
export function coverageOf(adapters: readonly ProviderAdapter[]): CoverageCountry[] {
  const can = (adapter: ProviderAdapter, operator: Operator, capability: Capability) =>
    adapter.supports(operatorCountry(operator), operator, capability) &&
    (capability === "payout" ? typeof adapter.createPayout === "function" : capability === "refund" ? typeof adapter.createRefund === "function" : true);
  const rows: CoverageCountry[] = [];
  for (const country of COUNTRIES) {
    const operators = OPERATORS.filter((operator) => operatorCountry(operator) === country);
    const result: CoverageCountry = { country, operators: [], deposit: [], payout: [], refund: [] };
    for (const adapter of adapters) {
      for (const capability of ["deposit", "payout", "refund"] as const) {
        if (operators.some((operator) => can(adapter, operator, capability))) result[capability].push(adapter.id);
      }
      for (const operator of operators) {
        if (["deposit", "payout", "refund"].some((capability) => can(adapter, operator, capability as Capability)) && !result.operators.includes(operator)) result.operators.push(operator);
      }
    }
    if (result.operators.length > 0) rows.push(result);
  }
  return rows;
}

export interface ProviderHealth {
  provider: string;
  capabilities: Capability[];
  countries: number;
  /** Paiements réglés (réussis ou échoués) sur la dernière heure ; null s'il n'y en a pas. */
  lastHour: { settled: number; succeeded: number; rate: number } | null;
  needsReconciliation: number;
}

/** État par agrégateur, calculé depuis les paiements récents (jamais inventé : `lastHour` est null sans données). */
export function healthOf(adapters: readonly ProviderAdapter[], payments: Payment[], now: number): ProviderHealth[] {
  const coverage = coverageOf(adapters);
  return adapters.map((adapter) => {
    const mine = payments.filter((payment) => payment.provider === adapter.id);
    const recent = mine.filter((payment) => now - payment.updatedAt <= 3_600_000 && (payment.status === "succeeded" || payment.status === "failed"));
    const succeeded = recent.filter((payment) => payment.status === "succeeded").length;
    const capabilities = (["deposit", "payout", "refund"] as const).filter((capability) => coverage.some((row) => row[capability].includes(adapter.id)));
    return {
      provider: adapter.id,
      capabilities,
      countries: coverage.filter((row) => capabilitiesOf(row).includes(adapter.id)).length,
      lastHour: recent.length === 0 ? null : { settled: recent.length, succeeded, rate: succeeded / recent.length },
      needsReconciliation: mine.filter((payment) => payment.needsReconciliation).length,
    };
  });
}

const capabilitiesOf = (row: CoverageCountry) => [...new Set([...row.deposit, ...row.payout, ...row.refund])];

export interface TimelineStep {
  at: number;
  kind: "created" | "status" | "refund" | "webhook";
  title: string;
  detail: string;
  tone: "neutral" | "success" | "danger" | "info";
}

const STATUS_FR: Record<string, string> = {
  created: "créé",
  pending: "en attente",
  processing: "en cours",
  succeeded: "réussi",
  failed: "échoué",
  expired: "expiré",
  cancelled: "annulé",
  refunded: "remboursé",
  partially_refunded: "remboursé en partie",
};

function eventType(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null && "type" in parsed && typeof parsed.type === "string") return parsed.type;
  } catch {
    /* corps non JSON */
  }
  return null;
}

/**
 * Chronologie d'un paiement à partir de ce que Pont a réellement enregistré : création, dernier statut,
 * remboursements et livraisons de webhooks sortants qui mentionnent ce paiement. Pas d'étape supposée.
 */
export async function timelineOf(payment: Payment, deliveries: Delivery[], refunds: RefundStore): Promise<TimelineStep[]> {
  const steps: TimelineStep[] = [{ at: payment.createdAt, kind: "created", title: "Paiement créé", detail: `Acheminé vers ${payment.provider}.`, tone: "neutral" }];
  if (payment.updatedAt > payment.createdAt || payment.status !== "created") {
    steps.push({
      at: payment.updatedAt,
      kind: "status",
      title: `Statut : ${STATUS_FR[payment.status] ?? payment.status}`,
      detail: payment.failureCode ? `Code d'échec : ${payment.failureCode}.` : payment.needsReconciliation ? "Statut incertain : vérification auprès de l'agrégateur en cours." : "Confirmé par vérification auprès de l'agrégateur.",
      tone: payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "neutral",
    });
  }
  for (const refund of await refunds.listByPayment(payment.id)) {
    steps.push({ at: refund.createdAt, kind: "refund", title: `Remboursement ${refund.status === "succeeded" ? "effectué" : "demandé"}`, detail: `${refund.amount} ${refund.currency}${refund.failureCode ? ` · ${refund.failureCode}` : ""}`, tone: refund.status === "failed" ? "danger" : "info" });
  }
  for (const delivery of deliveries.filter((d) => d.body.includes(payment.id))) {
    const last = delivery.attempts.at(-1);
    steps.push({
      at: delivery.createdAt,
      kind: "webhook",
      title: "Votre application notifiée",
      detail: `${eventType(delivery.body) ?? "événement"} → ${delivery.url} · ${delivery.status === "delivered" ? `livré${last?.httpStatus ? ` (HTTP ${last.httpStatus})` : ""}` : delivery.status === "failed" ? "échec" : "en attente"}`,
      tone: delivery.status === "delivered" ? "info" : delivery.status === "failed" ? "danger" : "neutral",
    });
  }
  return steps.sort((a, b) => a.at - b.at);
}
