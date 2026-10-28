import {
  normalizePhone,
  type Country,
  type DepositAccepted,
  type DepositRequest,
  type Operator,
  type Payment,
  type Payout,
  type PayoutRequest,
  type ProviderAdapter,
  type ProviderCallOutcome,
  type TransferAccepted,
  type TransferVerified,
  type VerifiedState,
  type WebhookCheck,
} from "@pont-bj/core";

/**
 * Scénarios pilotés par les 7 derniers chiffres du numéro. Cahier des charges §6 F3.
 * Exemple : +2290100000001 → succès.
 */
export const MAGIC_NUMBERS = {
  "0000001": "success",
  "0000002": "insufficient_funds",
  "0000003": "never_confirmed",
  "0000004": "success_duplicate_webhook",
  "0000005": "success_late_webhook",
  "0000006": "provider_down_before_push",
  "0000007": "ambiguous_timeout",
  "0000008": "declined_by_customer",
} as const;

export type SandboxScenario = (typeof MAGIC_NUMBERS)[keyof typeof MAGIC_NUMBERS];

export function scenarioFor(phoneE164: string): SandboxScenario {
  const suffix = phoneE164.slice(-7);
  return suffix in MAGIC_NUMBERS ? MAGIC_NUMBERS[suffix as keyof typeof MAGIC_NUMBERS] : "success";
}

interface SandboxRecord {
  scenario: SandboxScenario;
  amount: number;
  currency: string;
  createdAt: number;
}

/** Adaptateur simulé : fonctionne sans aucun compte agrégateur, avec les mêmes validations que le live. */
export class SandboxAdapter implements ProviderAdapter {
  readonly id = "sandbox" as const;
  readonly mode = "test" as const;
  private readonly records = new Map<string, SandboxRecord>();
  private readonly payouts = new Map<string, SandboxRecord>();
  private readonly now: () => number;
  /** Délai après lequel un paiement jamais confirmé expire. */
  private readonly expiryMs: number;

  constructor(options: { now?: () => number; expiryMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.expiryMs = options.expiryMs ?? 5 * 60_000;
  }

  supports(_country: Country, _operator: Operator | null): boolean {
    return true;
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    const phone = normalizePhone(request.input.customer.phone, request.input.country);
    const scenario = scenarioFor(phone.e164);
    if (scenario === "provider_down_before_push") {
      return { kind: "unavailable_before_push", reason: "sandbox: agrégateur indisponible" };
    }
    if (scenario === "ambiguous_timeout") {
      this.records.set(request.attemptId, this.record(request, scenario));
      return { kind: "ambiguous", reason: "sandbox: timeout après envoi" };
    }
    this.records.set(request.attemptId, this.record(request, scenario));
    return {
      kind: "ok",
      value: {
        providerRef: `sbx_${request.attemptId}`,
        nextAction: { type: "await_customer", message: "Validez le paiement sur votre téléphone (simulation)." },
      },
    };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    const record = this.records.get(payment.attemptId);
    if (!record) {
      return { kind: "ok", value: { status: "failed", amount: null, currency: null, providerRef: null, failureCode: "not_found" } };
    }
    const base = { amount: record.amount, currency: record.currency, providerRef: `sbx_${payment.attemptId}` };
    switch (record.scenario) {
      case "insufficient_funds":
        return { kind: "ok", value: { ...base, status: "failed", failureCode: "insufficient_funds" } };
      case "declined_by_customer":
        return { kind: "ok", value: { ...base, status: "failed", failureCode: "declined_by_customer" } };
      case "never_confirmed": {
        const expired = this.now() - record.createdAt >= this.expiryMs;
        return { kind: "ok", value: { ...base, status: expired ? "expired" : "pending", failureCode: expired ? "expired" : null } };
      }
      default:
        return { kind: "ok", value: { ...base, status: "succeeded", failureCode: null } };
    }
  }

  async checkWebhook(_headers: Headers, rawBody: string): Promise<WebhookCheck> {
    const match = /"attemptId"\s*:\s*"([^"]+)"/.exec(rawBody);
    return { valid: match !== null, lookup: match?.[1] ? { by: "attemptId", value: match[1] } : null };
  }

  /** Retraits simulés : mêmes numéros magiques (…0000002 et …0000008 échouent, …0000007 est ambigu puis réussi). */
  async createPayout(request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const phone = normalizePhone(request.input.recipient.phone, request.input.country);
    const scenario = scenarioFor(phone.e164);
    if (scenario === "provider_down_before_push") return { kind: "unavailable_before_push", reason: "sandbox: agrégateur indisponible" };
    this.payouts.set(request.attemptId, { scenario, amount: request.input.amount, currency: request.input.currency, createdAt: this.now() });
    if (scenario === "ambiguous_timeout") return { kind: "ambiguous", reason: "sandbox: timeout après envoi" };
    return { kind: "ok", value: { providerRef: `sbx_po_${request.attemptId}`, status: "processing" } };
  }

  async verifyPayout(payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    const record = this.payouts.get(payout.attemptId);
    if (!record) return { kind: "ok", value: { status: "failed", amount: null, currency: null, providerRef: null, failureCode: "not_found" } };
    const failed = record.scenario === "insufficient_funds" || record.scenario === "declined_by_customer";
    return {
      kind: "ok",
      value: {
        status: failed ? "failed" : "succeeded",
        amount: record.amount,
        currency: record.currency,
        providerRef: `sbx_po_${payout.attemptId}`,
        failureCode: failed ? "recipient_not_found" : null,
      },
    };
  }

  /** Nombre de webhooks que le sandbox enverrait pour ce paiement (doublon simulé). */
  webhookDeliveries(attemptId: string): number {
    return this.records.get(attemptId)?.scenario === "success_duplicate_webhook" ? 2 : 1;
  }

  private record(request: DepositRequest, scenario: SandboxScenario): SandboxRecord {
    return { scenario, amount: request.input.amount, currency: request.input.currency, createdAt: this.now() };
  }
}
