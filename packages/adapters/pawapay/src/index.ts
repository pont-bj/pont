import {
  normalizePhone,
  requestJson,
  numberField,
  stringField,
  verifyContentDigest,
  verifyHttpSignature,
  type Capability,
  type Country,
  type DepositAccepted,
  type DepositRequest,
  type FetchLike,
  type HttpResult,
  type Mode,
  type Operator,
  type Payment,
  type PaymentStatus,
  type Payout,
  type PayoutRequest,
  type ProviderAdapter,
  type ProviderCallOutcome,
  type RecordKind,
  type Refund,
  type RefundRequest,
  type TransferAccepted,
  type TransferStatus,
  type TransferVerified,
  type VerifiedState,
  type WebhookCheck,
  type WebhookContext,
} from "@pont-bj/core";

// Doc : docs/providers/pawapay/llms-full.txt — fiche : docs/metier/agregateurs/pawapay.md
const BASE_URLS: Record<Mode, string> = {
  test: "https://api.sandbox.pawapay.io",
  live: "https://api.pawapay.io",
};

export const PAWAPAY_PROVIDERS: Partial<Record<Operator, { code: string; country: Country; auth: "PROVIDER_AUTH" | "PREAUTH" | "REDIRECT_AUTH" }>> = {
  mtn_bj: { code: "MTN_MOMO_BEN", country: "BJ", auth: "PROVIDER_AUTH" },
  moov_bj: { code: "MOOV_BEN", country: "BJ", auth: "PROVIDER_AUTH" },
  moov_bf: { code: "MOOV_BFA", country: "BF", auth: "PROVIDER_AUTH" },
  orange_bf: { code: "ORANGE_BFA", country: "BF", auth: "PREAUTH" },
  mtn_cm: { code: "MTN_MOMO_CMR", country: "CM", auth: "PROVIDER_AUTH" },
  orange_cm: { code: "ORANGE_CMR", country: "CM", auth: "PROVIDER_AUTH" },
  mtn_ci: { code: "MTN_MOMO_CIV", country: "CI", auth: "PROVIDER_AUTH" },
  orange_ci: { code: "ORANGE_CIV", country: "CI", auth: "PROVIDER_AUTH" },
  wave_ci: { code: "WAVE_CIV", country: "CI", auth: "REDIRECT_AUTH" },
  free_sn: { code: "FREE_SEN", country: "SN", auth: "PROVIDER_AUTH" },
  orange_sn: { code: "ORANGE_SEN", country: "SN", auth: "PROVIDER_AUTH" },
  wave_sn: { code: "WAVE_SEN", country: "SN", auth: "REDIRECT_AUTH" },
  mtn_cg: { code: "MTN_MOMO_COG", country: "CG", auth: "PROVIDER_AUTH" },
  airtel_cg: { code: "AIRTEL_COG", country: "CG", auth: "PROVIDER_AUTH" },
  airtel_ga: { code: "AIRTEL_GAB", country: "GA", auth: "PROVIDER_AUTH" },
};

// Statuts documentés : ACCEPTED, ENQUEUED (payouts/refunds), SUBMITTED (sandbox), PROCESSING, IN_RECONCILIATION, COMPLETED, FAILED.
const DEPOSIT_STATUS: Record<string, PaymentStatus> = {
  ACCEPTED: "pending",
  ENQUEUED: "pending",
  SUBMITTED: "processing",
  PROCESSING: "processing",
  IN_RECONCILIATION: "processing",
  COMPLETED: "succeeded",
  FAILED: "failed",
};

const TRANSFER_STATUS: Record<string, TransferStatus> = {
  ACCEPTED: "pending",
  ENQUEUED: "pending",
  SUBMITTED: "processing",
  PROCESSING: "processing",
  IN_RECONCILIATION: "processing",
  COMPLETED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Instructions de préautorisation Orange Burkina (doc PawaPay, « Preauthorised flows »).
 * Les valeurs à jour sont servies par l'endpoint « active configuration » de PawaPay ; celles-ci en sont la copie documentée.
 */
export const PREAUTH_INSTRUCTIONS = {
  operator: "orange_bf",
  shortCode: "*144*4*6#",
  /** Lien de pré-numérotation à utiliser comme `href` d'un bouton sur mobile. */
  quickLink: "tel:*144*4*6%23",
  fr: ["Composez *144*4*6#", "Entrez le montant", "Entrez le code PIN", "Entrez le code à usage unique reçu par SMS"],
  en: ["Dial *144*4*6#", "Enter amount", "Enter PIN", "Use OTP"],
} as const;

/** Codes de rejet à l'initiation qui garantissent que rien n'a été envoyé au client. */
const SAFE_TO_FAILOVER = new Set(["PROVIDER_TEMPORARILY_UNAVAILABLE"]);

export interface PawaPayConfig {
  mode: Mode;
  apiToken: string;
  /**
   * Clés publiques PawaPay (PEM) par `keyid`, récupérées via `GET /v2/public-key/http`.
   * Si fourni, tout callback doit être signé (RFC 9421) — à activer avec « Signed callbacks » dans le dashboard.
   */
  callbackPublicKeys?: Record<string, string>;
  fetch?: FetchLike;
  now?: () => number;
}

type Initiation = "deposits" | "payouts" | "refunds";

export class PawaPayAdapter implements ProviderAdapter {
  readonly id = "pawapay" as const;
  readonly mode: Mode;
  private readonly config: PawaPayConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: PawaPayConfig) {
    this.config = config;
    this.mode = config.mode;
    this.fetchImpl = config.fetch ?? fetch;
  }

  supports(country: Country, operator: Operator | null, capability: Capability): boolean {
    // PawaPay exige l'opérateur : pas de détection automatique au MVP.
    if (operator === null) return capability === "refund" || capability === "verify";
    const provider = PAWAPAY_PROVIDERS[operator];
    if (!provider || provider.country !== country) return false;
    return true;
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    const { input, attemptId } = request;
    const provider = input.operator ? PAWAPAY_PROVIDERS[input.operator] : undefined;
    if (!provider) return { kind: "rejected", code: "operator_required", message: "PawaPay exige un opérateur couvert." };
    // PREAUTH (Orange Burkina) : le client génère un code à usage unique AVANT le paiement.
    if (provider.auth === "PREAUTH" && !input.preAuthorisationCode) {
      return {
        kind: "rejected",
        code: "preauth_code_required",
        message: `Code de préautorisation requis : ${PREAUTH_INSTRUCTIONS.fr.join(" → ")}`,
      };
    }
    const phone = normalizePhone(input.customer.phone, input.country, { allowLegacyBenin: this.mode === "test" });

    const result = await this.post("deposits", {
      depositId: attemptId,
      amount: String(input.amount),
      currency: input.currency,
      payer: { type: "MMO", accountDetails: { phoneNumber: phone.msisdn, provider: provider.code } },
      clientReferenceId: input.reference,
      ...(provider.auth === "PREAUTH" ? { preAuthorisationCode: input.preAuthorisationCode } : {}),
    });
    const outcome = this.initiationOutcome(result);
    if (outcome.kind !== "ok") return outcome;
    const authUrl = stringField(outcome.value, "authorizationUrl");
    const nextAction: DepositAccepted["nextAction"] = authUrl
      ? { type: "redirect", url: authUrl }
      : { type: "await_customer", message: "Validez le paiement sur votre téléphone." };
    return { kind: "ok", value: { providerRef: attemptId, nextAction } };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    const found = await this.check("deposits", payment.attemptId);
    if (found.kind !== "ok") return found;
    if (found.value === null) {
      return { kind: "ok", value: { status: "failed", amount: null, currency: null, providerRef: null, failureCode: "not_found" } };
    }
    const data = found.value;
    const status = DEPOSIT_STATUS[stringField(data, "status") ?? ""] ?? "processing";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(data, "amount"),
        currency: stringField(data, "currency"),
        providerRef: payment.attemptId,
        failureCode: status === "failed" ? stringField(data, "failureReason", "failureCode") ?? "FAILED" : null,
        attemptRef: stringField(data, "depositId"),
      },
    };
  }

  async createPayout(request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const { input, attemptId } = request;
    const provider = PAWAPAY_PROVIDERS[input.operator];
    if (!provider || provider.country !== input.country) {
      return { kind: "rejected", code: "operator_not_supported", message: "Opérateur non couvert par PawaPay." };
    }
    const phone = normalizePhone(input.recipient.phone, input.country, { allowLegacyBenin: this.mode === "test" });
    const result = await this.post("payouts", {
      payoutId: attemptId,
      amount: String(input.amount),
      currency: input.currency,
      recipient: { type: "MMO", accountDetails: { phoneNumber: phone.msisdn, provider: provider.code } },
      clientReferenceId: input.reference,
    });
    const outcome = this.initiationOutcome(result);
    if (outcome.kind !== "ok") return outcome;
    return { kind: "ok", value: { providerRef: attemptId, status: "pending" } };
  }

  async verifyPayout(payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    return this.verifyTransfer("payouts", payout.attemptId);
  }

  /** Remboursement total ou partiel (`amount` + `currency`), plusieurs partiels permis tant que le total ≤ dépôt. */
  async createRefund(request: RefundRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const result = await this.post("refunds", {
      refundId: request.attemptId,
      depositId: request.payment.attemptId,
      ...(request.full ? {} : { amount: String(request.amount), currency: request.currency }),
    });
    const outcome = this.initiationOutcome(result);
    if (outcome.kind !== "ok") return outcome;
    return { kind: "ok", value: { providerRef: request.attemptId, status: "pending" } };
  }

  async verifyRefund(refund: Pick<Refund, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    return this.verifyTransfer("refunds", refund.attemptId);
  }

  /**
   * Callback = déclencheur ; le statut est toujours relu via l'API (R-003).
   * Avec `callbackPublicKeys`, la signature RFC 9421 est exigée (méthode, chemin, date, digest).
   */
  async checkWebhook(headers: Headers, rawBody: string, context?: WebhookContext): Promise<WebhookCheck> {
    if (this.config.callbackPublicKeys) {
      if (!context) return { valid: false, lookup: null };
      const result = verifyHttpSignature(
        { method: context.method, url: context.url, headers, body: rawBody },
        {
          publicKeys: this.config.callbackPublicKeys,
          requiredComponents: ["@method", "@path", "signature-date", "content-digest"],
          nowSeconds: Math.floor((this.config.now ?? Date.now)() / 1000),
        },
      );
      if (!result.valid) return { valid: false, lookup: null };
    } else {
      const digest = headers.get("content-digest");
      if (digest && !verifyContentDigest(digest, rawBody)) return { valid: false, lookup: null };
    }

    let body: unknown = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { valid: false, lookup: null };
    }
    const candidates: Array<[RecordKind, string]> = [
      ["refund", "refundId"],
      ["payout", "payoutId"],
      ["payment", "depositId"],
    ];
    for (const [kind, key] of candidates) {
      const value = stringField(body, key);
      if (value) return { valid: true, lookup: { kind, by: "attemptId", value } };
    }
    return { valid: false, lookup: null };
  }

  private async post(path: Initiation, body: unknown): Promise<HttpResult> {
    return requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}/v2/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Réponse d'initiation commune aux dépôts, retraits et remboursements. */
  private initiationOutcome(result: HttpResult): ProviderCallOutcome<unknown> {
    if (result.kind === "not_sent") return { kind: "unavailable_before_push", reason: result.reason };
    // UNKNOWN_ERROR, 5xx, timeout : la doc interdit de conclure à un échec. R-005
    if (result.kind === "unknown") return { kind: "ambiguous", reason: result.reason };
    if (result.status >= 500) return { kind: "ambiguous", reason: `HTTP ${result.status}` };
    const status = stringField(result.body, "status");
    if (status === "ACCEPTED" || status === "DUPLICATE_IGNORED") return { kind: "ok", value: result.body };
    // Dépôts et retraits : `failureReason` ; remboursements : `rejectionReason`.
    const code =
      stringField(result.body, "failureReason", "failureCode") ??
      stringField(result.body, "rejectionReason", "rejectionCode") ??
      `pawapay_${result.status}`;
    const message =
      stringField(result.body, "failureReason", "failureMessage") ??
      stringField(result.body, "rejectionReason", "rejectionMessage") ??
      "Demande refusée par PawaPay.";
    if (SAFE_TO_FAILOVER.has(code)) return { kind: "unavailable_before_push", reason: code };
    return { kind: "rejected", code, message };
  }

  /** `GET /v2/{type}/{id}` → `{ status: FOUND, data }` ou `{ status: NOT_FOUND }` (null). */
  private async check(path: Initiation, id: string): Promise<ProviderCallOutcome<unknown>> {
    const result = await requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}/v2/${path}/${id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${this.config.apiToken}` },
    });
    if (result.kind !== "response") return { kind: "ambiguous", reason: result.reason };
    if (result.status >= 500) return { kind: "ambiguous", reason: `HTTP ${result.status}` };
    if (result.status >= 400) return { kind: "rejected", code: `pawapay_${result.status}`, message: "Vérification refusée par PawaPay." };
    // Seul NOT_FOUND permet de conclure qu'une opération n'existe pas.
    if (stringField(result.body, "status") === "NOT_FOUND") return { kind: "ok", value: null };
    return { kind: "ok", value: (result.body as { data?: unknown }).data ?? null };
  }

  private async verifyTransfer(path: "payouts" | "refunds", id: string): Promise<ProviderCallOutcome<TransferVerified>> {
    const found = await this.check(path, id);
    if (found.kind !== "ok") return found;
    if (found.value === null) return { kind: "ok", value: { status: "failed", amount: null, currency: null, providerRef: null, failureCode: "not_found" } };
    const data = found.value;
    const status = TRANSFER_STATUS[stringField(data, "status") ?? ""] ?? "processing";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(data, "amount"),
        currency: stringField(data, "currency"),
        providerRef: id,
        failureCode: status === "failed" ? stringField(data, "failureReason", "failureCode") ?? "FAILED" : null,
      },
    };
  }
}
