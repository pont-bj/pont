import {
  normalizePhone,
  requestJson,
  field,
  numberField,
  stringField,
  verifyTimestampedHmac,
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
  type Capability,
  type Payout,
  type PayoutRequest,
  type TransferAccepted,
  type TransferStatus,
  type TransferVerified,
} from "@pont-bj/core";

// Doc : docs/providers/fedapay/ — fiche : docs/metier/agregateurs/fedapay.md
const BASE_URLS: Record<Mode, string> = {
  test: "https://sandbox-api.fedapay.com/v1",
  live: "https://api.fedapay.com/v1",
};

// Source : docs/providers/fedapay/payment-methods.md (page officielle « Payment Methods »).
const COUNTRIES: ReadonlySet<Country> = new Set(["BJ", "TG", "GN", "CI", "NE", "SN", "ML", "BF"]);

/** Opérateurs proposés sur le checkout hébergé, par pays (Guinée et Niger : opérateurs hors de la liste Pont). */
const COLLECT_OPERATORS: ReadonlySet<Operator> = new Set([
  "mtn_bj", "moov_bj", "celtiis_bj",
  "moov_tg", "tmoney_tg",
  "mtn_ci", "moov_ci", "wave_ci", "orange_ci",
  "wave_sn", "orange_sn", "free_sn",
  "orange_ml",
  "moov_bf", "orange_bf",
]);

/** Paiement sans redirection (`POST /transactions/{mode}`) : codes officiels. */
const DIRECT_MODES: Partial<Record<Operator, string>> = {
  mtn_bj: "mtn_open",
  moov_bj: "moov",
  celtiis_bj: "sbin",
  moov_tg: "moov_tg",
  tmoney_tg: "togocel",
  mtn_ci: "mtn_ci",
  free_sn: "free_sn",
};

/** Retraits (tous sans redirection) : codes officiels. */
const PAYOUT_MODES: Partial<Record<Operator, string>> = {
  mtn_bj: "mtn_open",
  moov_bj: "moov",
  celtiis_bj: "sbin",
  moov_tg: "moov_tg",
  tmoney_tg: "togocel",
  mtn_ci: "mtn_ci",
  moov_ci: "moov_ci",
  wave_ci: "wave_ci",
  orange_ci: "orange_ci",
  wave_sn: "wave_sn",
  orange_sn: "orange_sn",
  moov_bf: "moov_bf",
  orange_bf: "orange_bf",
};

// Statuts présents dans l'OpenAPI (pending, approved, canceled, transferred) ; `declined` vient des événements
// `transaction.declined`. Tout statut inconnu reste `pending` : jamais de succès par défaut.
const STATUS_MAP: Record<string, PaymentStatus> = {
  pending: "pending",
  approved: "succeeded",
  transferred: "succeeded",
  declined: "failed",
  canceled: "cancelled",
};

// Cycle de vie documenté (payouts-management.md) : pending → started → processing → sent | failed.
const PAYOUT_STATUS: Record<string, TransferStatus> = {
  pending: "pending",
  scheduled: "pending",
  started: "processing",
  processing: "processing",
  sent: "succeeded",
  failed: "failed",
};

export interface FedaPayConfig {
  mode: Mode;
  secretKey: string;
  /** Secret de l'endpoint webhook (différent en test et en live). */
  webhookSecret: string;
  fetch?: FetchLike;
  now?: () => number;
}

/** L'API répond parfois sous la clé `v1/transaction` (SDK officiels), parfois à plat (OpenAPI). */
function unwrapTransaction(body: unknown): unknown {
  return field(body, "v1/transaction") ?? body;
}

export class FedaPayAdapter implements ProviderAdapter {
  readonly id = "fedapay" as const;
  readonly mode: Mode;
  private readonly config: FedaPayConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: FedaPayConfig) {
    this.config = config;
    this.mode = config.mode;
    this.fetchImpl = config.fetch ?? fetch;
  }

  supports(country: Country, operator: Operator | null, capability: Capability): boolean {
    if (!COUNTRIES.has(country)) return false;
    // Remboursement uniquement depuis le dashboard.
    if (capability === "refund") return false;
    if (capability === "payout") return operator !== null && PAYOUT_MODES[operator] !== undefined && operator.endsWith(`_${country.toLowerCase()}`);
    // Sans opérateur précisé, le client le choisit sur le checkout hébergé.
    return operator === null || (COLLECT_OPERATORS.has(operator) && operator.endsWith(`_${country.toLowerCase()}`));
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    const { input, attemptId } = request;
    const phone = normalizePhone(input.customer.phone, input.country);
    const [firstname, ...rest] = (input.customer.name ?? "").trim().split(/\s+/);

    const created = await this.call("POST", "/transactions", {
      description: input.description ?? `Commande ${input.reference}`,
      amount: input.amount,
      currency: { iso: input.currency },
      callback_url: input.returnUrl ?? request.callbackUrl,
      custom_metadata: { pont_attempt_id: attemptId, reference: input.reference },
      customer: {
        ...(firstname ? { firstname } : {}),
        ...(rest.length ? { lastname: rest.join(" ") } : {}),
        ...(input.customer.email ? { email: input.customer.email } : {}),
        phone_number: { number: phone.e164, country: input.country.toLowerCase() },
      },
    });
    // Créer une transaction FedaPay ne sollicite pas le client : tout échec ici est sans risque. R-006
    if (created.kind !== "ok") return created.kind === "rejected" ? created : { kind: "unavailable_before_push", reason: created.reason };

    const transactionId = stringField(unwrapTransaction(created.value), "id");
    if (!transactionId) return { kind: "unavailable_before_push", reason: "réponse sans id de transaction" };

    const tokenResult = await this.call("POST", `/transactions/${transactionId}/token`, {});
    if (tokenResult.kind !== "ok") return tokenResult.kind === "rejected" ? tokenResult : { kind: "unavailable_before_push", reason: tokenResult.reason };
    const token = stringField(tokenResult.value, "token");
    const url = stringField(tokenResult.value, "url");
    if (!token || !url) return { kind: "unavailable_before_push", reason: "réponse sans token" };

    const directMode = input.method === "mobile_money" && input.operator ? DIRECT_MODES[input.operator] : undefined;
    if (!directMode) {
      return { kind: "ok", value: { providerRef: transactionId, nextAction: { type: "redirect", url } } };
    }

    const sent = await this.call("POST", `/transactions/${directMode}`, {
      token,
      phone_number: { number: phone.e164, country: input.country.toLowerCase() },
    });
    if (sent.kind === "rejected") return sent;
    // Après cet appel le client a pu recevoir la demande : tout échec non explicite est ambigu. R-005
    if (sent.kind !== "ok") return { kind: "ambiguous", reason: sent.reason };
    return {
      kind: "ok",
      value: { providerRef: transactionId, nextAction: { type: "await_customer", message: "Validez le paiement sur votre téléphone." } },
    };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    if (!payment.providerRef) return { kind: "rejected", code: "missing_provider_ref", message: "Transaction FedaPay inconnue." };
    const result = await this.call("GET", `/transactions/${payment.providerRef}`);
    if (result.kind !== "ok") return result.kind === "rejected" ? result : { kind: "ambiguous", reason: result.reason };
    const tx = unwrapTransaction(result.value);
    const raw = stringField(tx, "status") ?? "";
    const status = STATUS_MAP[raw] ?? "pending";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(tx, "amount"),
        currency: stringField(tx, "currency", "iso"),
        providerRef: payment.providerRef,
        failureCode: status === "failed" || status === "cancelled" ? stringField(tx, "last_error_code") ?? raw : null,
        attemptRef: stringField(tx, "custom_metadata", "pont_attempt_id"),
      },
    };
  }

  async checkWebhook(headers: Headers, rawBody: string): Promise<WebhookCheck> {
    const valid = verifyTimestampedHmac({
      secret: this.config.webhookSecret,
      rawBody,
      header: headers.get("x-fedapay-signature"),
      scheme: "s",
      toleranceSeconds: 300,
      now: Math.floor((this.config.now ?? Date.now)() / 1000),
    });
    if (!valid) return { valid: false, lookup: null };
    let body: unknown = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { valid: false, lookup: null };
    }
    const id = stringField(body, "entity", "id");
    const kind = (stringField(body, "name") ?? "").startsWith("payout.") ? "payout" : "payment";
    return { valid: true, lookup: id ? { kind, by: "providerRef", value: id } : null };
  }

  /** Création (sans envoi) puis `PUT /payouts/start`. Le `mode` officiel est envoyé pour éviter une détection erronée. */
  async createPayout(request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const { input, attemptId } = request;
    const mode = PAYOUT_MODES[input.operator];
    if (!mode) return { kind: "rejected", code: "operator_not_supported", message: "Opérateur non couvert par les retraits FedaPay." };
    const phone = normalizePhone(input.recipient.phone, input.country);
    const [firstname, ...rest] = (input.recipient.name ?? "").trim().split(/\s+/);
    const created = await this.call("POST", "/payouts", {
      amount: input.amount,
      currency: { iso: input.currency },
      mode,
      description: input.description ?? `Retrait ${input.reference}`,
      custom_metadata: { pont_attempt_id: attemptId, reference: input.reference },
      customer: {
        ...(firstname ? { firstname } : {}),
        ...(rest.length ? { lastname: rest.join(" ") } : {}),
        ...(input.recipient.email ? { email: input.recipient.email } : {}),
        phone_number: { number: phone.e164, country: input.country.toLowerCase() },
      },
    });
    // Un payout créé reste `pending` tant qu'il n'est pas démarré : échec sans risque.
    if (created.kind !== "ok") return created.kind === "rejected" ? created : { kind: "unavailable_before_push", reason: created.reason };
    const payoutId = stringField(field(created.value, "v1/payout") ?? created.value, "id");
    if (!payoutId) return { kind: "unavailable_before_push", reason: "réponse sans id de payout" };

    const started = await this.call("PUT", "/payouts/start", { payouts: [{ id: Number(payoutId) }] });
    if (started.kind === "rejected") return started;
    if (started.kind !== "ok") return { kind: "ambiguous", reason: started.reason };
    return { kind: "ok", value: { providerRef: payoutId, status: "processing" } };
  }

  async verifyPayout(payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    if (!payout.providerRef) return { kind: "rejected", code: "missing_provider_ref", message: "Payout FedaPay inconnu." };
    const result = await this.call("GET", `/payouts/${payout.providerRef}`);
    if (result.kind !== "ok") return result.kind === "rejected" ? result : { kind: "ambiguous", reason: result.reason };
    const body = field(result.value, "v1/payout") ?? result.value;
    const raw = stringField(body, "status") ?? "";
    const status = PAYOUT_STATUS[raw] ?? "processing";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(body, "amount"),
        currency: stringField(body, "currency", "iso"),
        providerRef: payout.providerRef,
        failureCode: status === "failed" ? stringField(body, "last_error_code") ?? raw : null,
      },
    };
  }

  private async call(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<ProviderCallOutcome<unknown>> {
    const result = await requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.config.secretKey}`, "content-type": "application/json", accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (result.kind === "not_sent") return { kind: "unavailable_before_push", reason: result.reason };
    if (result.kind === "unknown") return { kind: "ambiguous", reason: result.reason };
    if (result.status >= 200 && result.status < 300) return { kind: "ok", value: result.body };
    if (result.status >= 400 && result.status < 500) {
      return { kind: "rejected", code: `fedapay_${result.status}`, message: stringField(result.body, "message") ?? "Requête refusée par FedaPay." };
    }
    return { kind: "ambiguous", reason: `HTTP ${result.status}` };
  }
}
