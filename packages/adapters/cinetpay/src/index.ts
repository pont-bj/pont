import {
  requestJson,
  numberField,
  stringField,
  type Capability,
  type Country,
  type DepositAccepted,
  type DepositRequest,
  type FetchLike,
  type Mode,
  type Operator,
  type Payment,
  type PaymentStatus,
  type ProviderAdapter,
  type ProviderCallOutcome,
  type VerifiedState,
  type WebhookCheck,
} from "@pont/core";

// EXPÉRIMENTAL : docs.cinetpay.com injoignable le 2026-10-26, CGU non lues, maintien au MVP en attente (T-002).
// Endpoint d'initialisation confirmé ; endpoint de vérification et statuts à confirmer en sandbox.
const API = "https://api-checkout.cinetpay.com/v2";

const COUNTRIES: ReadonlySet<Country> = new Set(["CI", "SN", "CM", "BF", "ML", "TG", "GN", "BJ", "CD", "NE"]);

const STATUS_MAP: Record<string, PaymentStatus> = {
  ACCEPTED: "succeeded",
  REFUSED: "failed",
  CANCELED: "cancelled",
  WAITING_FOR_CUSTOMER: "pending",
  PENDING: "pending",
};

export interface CinetPayConfig {
  mode: Mode;
  apiKey: string;
  siteId: string;
  fetch?: FetchLike;
}

export class CinetPayAdapter implements ProviderAdapter {
  readonly id = "cinetpay" as const;
  readonly mode: Mode;
  private readonly config: CinetPayConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: CinetPayConfig) {
    this.config = config;
    this.mode = config.mode;
    this.fetchImpl = config.fetch ?? fetch;
  }

  supports(country: Country, _operator: Operator | null, capability: Capability): boolean {
    return COUNTRIES.has(country) && (capability === "deposit" || capability === "verify");
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    const { input, attemptId } = request;
    // R-008 : contrainte explicite, jamais d'arrondi silencieux.
    if (input.amount % 5 !== 0) {
      return { kind: "rejected", code: "amount_not_multiple_of_5", message: "CinetPay exige un montant multiple de 5." };
    }
    const result = await requestJson(this.fetchImpl, `${API}/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apikey: this.config.apiKey,
        site_id: this.config.siteId,
        transaction_id: attemptId,
        amount: input.amount,
        currency: input.currency,
        description: input.description ?? `Commande ${input.reference}`,
        notify_url: request.callbackUrl,
        return_url: input.returnUrl ?? request.callbackUrl,
        channels: "ALL",
        metadata: input.reference,
      }),
    });
    // Page de paiement hébergée : aucun envoi au client à ce stade. R-006
    if (result.kind !== "response" || result.status >= 500) {
      return { kind: "unavailable_before_push", reason: result.kind === "response" ? `HTTP ${result.status}` : result.reason };
    }
    const url = stringField(result.body, "data", "payment_url");
    if (stringField(result.body, "code") !== "201" || !url) {
      return { kind: "rejected", code: `cinetpay_${stringField(result.body, "code") ?? result.status}`, message: stringField(result.body, "message") ?? "Paiement refusé par CinetPay." };
    }
    return { kind: "ok", value: { providerRef: attemptId, nextAction: { type: "redirect", url } } };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    const result = await requestJson(this.fetchImpl, `${API}/payment/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apikey: this.config.apiKey, site_id: this.config.siteId, transaction_id: payment.attemptId }),
    });
    if (result.kind !== "response" || result.status >= 500) return { kind: "ambiguous", reason: result.kind === "response" ? `HTTP ${result.status}` : result.reason };
    const raw = stringField(result.body, "data", "status") ?? "";
    const status = STATUS_MAP[raw] ?? "pending";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(result.body, "data", "amount"),
        currency: stringField(result.body, "data", "currency"),
        providerRef: payment.attemptId,
        failureCode: status === "failed" || status === "cancelled" ? raw : null,
      },
    };
  }

  /**
   * Notification POST (form). La vérification HMAC `x-token` n'est pas implémentée tant que la formule
   * officielle n'est pas confirmée (T-011) : la notification ne sert que de déclencheur (R-003).
   */
  async checkWebhook(_headers: Headers, rawBody: string): Promise<WebhookCheck> {
    const params = new URLSearchParams(rawBody);
    const siteId = params.get("cpm_site_id");
    const transactionId = params.get("cpm_trans_id");
    if (siteId !== this.config.siteId || !transactionId) return { valid: false, lookup: null };
    return { valid: true, lookup: { by: "attemptId", value: transactionId } };
  }
}
