import {
  requestJson,
  numberField,
  safeEqual,
  sha512Hex,
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
  type Payout,
  type PayoutRequest,
  type TransferAccepted,
  type TransferStatus,
  type TransferVerified,
  normalizePhone,
} from "@pont-bj/core";

const DISBURSE_URL = "https://app.paydunya.com/api/v2/disburse";

/** `withdraw_mode` documentés (api_deboursement). */
const WITHDRAW_MODES: Partial<Record<Operator, string>> = {
  orange_sn: "orange-money-senegal",
  free_sn: "free-money-senegal",
  expresso_sn: "expresso-senegal",
  wave_sn: "wave-senegal",
  mtn_bj: "mtn-benin",
  moov_bj: "moov-benin",
  celtiis_bj: "celtiis-cash",
  mtn_ci: "mtn-ci",
  orange_ci: "orange-money-ci",
  moov_ci: "moov-ci",
  wave_ci: "wave-ci",
  tmoney_tg: "t-money-togo",
  moov_tg: "moov-togo",
  orange_ml: "orange-money-mali",
  orange_bf: "orange-money-burkina",
  moov_bf: "moov-burkina-faso",
  mtn_cm: "mtn-cameroun",
};

// Statuts documentés : created (non envoyé), pending, success, failed.
const DISBURSE_STATUS: Record<string, TransferStatus> = {
  created: "pending",
  pending: "processing",
  success: "succeeded",
  failed: "failed",
};

// Doc : docs/providers/paydunya/ — fiche : docs/metier/agregateurs/paydunya.md
const BASE_URLS: Record<Mode, string> = {
  test: "https://app.paydunya.com/sandbox-api/v1",
  live: "https://app.paydunya.com/api/v1",
};

const COUNTRIES: ReadonlySet<Country> = new Set(["SN", "CI", "BJ", "TG", "ML", "BF", "CM"]);

const INVOICE_STATUS: Record<string, PaymentStatus> = {
  pending: "pending",
  completed: "succeeded",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "failed",
};

export interface PayDunyaConfig {
  mode: Mode;
  masterKey: string;
  privateKey: string;
  token: string;
  storeName: string;
  fetch?: FetchLike;
}

export class PayDunyaAdapter implements ProviderAdapter {
  readonly id = "paydunya" as const;
  readonly mode: Mode;
  private readonly config: PayDunyaConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: PayDunyaConfig) {
    this.config = config;
    this.mode = config.mode;
    this.fetchImpl = config.fetch ?? fetch;
  }

  supports(country: Country, operator: Operator | null, capability: Capability): boolean {
    if (!COUNTRIES.has(country) || capability === "refund") return false;
    if (capability === "payout") return operator !== null && WITHDRAW_MODES[operator] !== undefined;
    return true;
  }

  /**
   * Retrait en deux temps : `get-invoice` (statut `created`, rien n'est envoyé) puis `submit-invoice`.
   * Montant XOF entier uniquement ; `account_alias` = numéro sans indicatif.
   */
  async createPayout(request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const { input, attemptId } = request;
    const mode = WITHDRAW_MODES[input.operator];
    if (!mode) return { kind: "rejected", code: "operator_not_supported", message: "Opérateur non couvert par PayDunya." };
    if (input.currency !== "XOF") return { kind: "rejected", code: "currency_not_supported", message: "Les retraits PayDunya sont en XOF uniquement." };
    const phone = normalizePhone(input.recipient.phone, input.country);

    const invoice = await requestJson(this.fetchImpl, `${DISBURSE_URL}/get-invoice`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ account_alias: phone.national, amount: input.amount, withdraw_mode: mode, callback_url: request.callbackUrl }),
    });
    if (invoice.kind !== "response" || invoice.status >= 500) {
      return { kind: "unavailable_before_push", reason: invoice.kind === "response" ? `HTTP ${invoice.status}` : invoice.reason };
    }
    const token = stringField(invoice.body, "disburse_token");
    if (stringField(invoice.body, "response_code") !== "00" || !token) {
      return { kind: "rejected", code: `paydunya_${stringField(invoice.body, "response_code") ?? invoice.status}`, message: stringField(invoice.body, "response_text") ?? "Retrait refusé par PayDunya." };
    }

    const submitted = await requestJson(this.fetchImpl, `${DISBURSE_URL}/submit-invoice`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ disburse_invoice: token, disburse_id: attemptId }),
    });
    // Après soumission, l'opérateur a pu être sollicité : tout échec non explicite est ambigu. R-005
    if (submitted.kind !== "response" || submitted.status >= 500) {
      return { kind: "ambiguous", reason: submitted.kind === "response" ? `HTTP ${submitted.status}` : submitted.reason };
    }
    if (stringField(submitted.body, "response_code") !== "00") {
      return { kind: "rejected", code: `paydunya_${stringField(submitted.body, "response_code") ?? submitted.status}`, message: stringField(submitted.body, "response_text") ?? "Retrait refusé par PayDunya." };
    }
    return { kind: "ok", value: { providerRef: token, status: "processing" } };
  }

  async verifyPayout(payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    if (!payout.providerRef) return { kind: "rejected", code: "missing_provider_ref", message: "Retrait PayDunya inconnu." };
    const result = await requestJson(this.fetchImpl, `${DISBURSE_URL}/check-status`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ disburse_invoice: payout.providerRef }),
    });
    if (result.kind !== "response" || result.status >= 500) return { kind: "ambiguous", reason: result.kind === "response" ? `HTTP ${result.status}` : result.reason };
    if (stringField(result.body, "response_code") !== "00") {
      return { kind: "rejected", code: "paydunya_not_found", message: stringField(result.body, "response_text") ?? "Retrait introuvable." };
    }
    const raw = stringField(result.body, "status") ?? "";
    const status = DISBURSE_STATUS[raw] ?? "processing";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(result.body, "amount"),
        currency: null,
        providerRef: payout.providerRef,
        failureCode: status === "failed" ? raw : null,
      },
    };
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    const { input, attemptId } = request;
    const result = await requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}/checkout-invoice/create`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        invoice: { total_amount: input.amount, description: input.description ?? `Commande ${input.reference}` },
        store: { name: this.config.storeName },
        actions: {
          callback_url: request.callbackUrl,
          ...(input.returnUrl ? { return_url: input.returnUrl, cancel_url: input.returnUrl } : {}),
        },
        custom_data: { pont_attempt_id: attemptId, reference: input.reference },
      }),
    });
    // Facture hébergée : le client n'est sollicité qu'en ouvrant l'URL, tout échec ici est sans risque. R-006
    if (result.kind !== "response") return { kind: "unavailable_before_push", reason: result.reason };
    if (result.status >= 500) return { kind: "unavailable_before_push", reason: `HTTP ${result.status}` };

    const url = stringField(result.body, "response_text");
    const token = stringField(result.body, "token");
    if (stringField(result.body, "response_code") !== "00" || !url || !token) {
      return { kind: "rejected", code: `paydunya_${stringField(result.body, "response_code") ?? result.status}`, message: url ?? "Facture refusée par PayDunya." };
    }
    return { kind: "ok", value: { providerRef: token, nextAction: { type: "redirect", url } } };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    if (!payment.providerRef) return { kind: "rejected", code: "missing_provider_ref", message: "Facture PayDunya inconnue." };
    const result = await requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}/checkout-invoice/confirm/${encodeURIComponent(payment.providerRef)}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (result.kind !== "response" || result.status >= 500) return { kind: "ambiguous", reason: result.kind === "response" ? `HTTP ${result.status}` : result.reason };
    if (stringField(result.body, "response_code") !== "00") {
      return { kind: "rejected", code: "paydunya_not_found", message: stringField(result.body, "response_text") ?? "Facture introuvable." };
    }
    const raw = stringField(result.body, "status") ?? "";
    const status = INVOICE_STATUS[raw] ?? "pending";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(result.body, "invoice", "total_amount"),
        currency: null, // non renvoyée par `confirm`

        providerRef: payment.providerRef,
        failureCode: status === "failed" || status === "cancelled" ? stringField(result.body, "fail_reason") || raw : null,
        attemptRef: stringField(result.body, "custom_data", "pont_attempt_id"),
      },
    };
  }

  /**
   * IPN `application/x-www-form-urlencoded`. Le hash officiel est SHA-512(master key) : il est identique
   * pour tous les IPN, donc il ne prouve presque rien. Le statut est toujours relu via `verify` (R-003).
   */
  async checkWebhook(_headers: Headers, rawBody: string): Promise<WebhookCheck> {
    const expected = sha512Hex(this.config.masterKey);
    // Retrait : callback JSON `{ hash, status, token, … }` (format non précisé pour le Content-Type, on accepte JSON).
    if (rawBody.trimStart().startsWith("{")) {
      let body: unknown = null;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return { valid: false, lookup: null };
      }
      const hash = stringField(body, "hash");
      const token = stringField(body, "token");
      if (!hash || !safeEqual(hash, expected)) return { valid: false, lookup: null };
      return { valid: true, lookup: token ? { kind: "payout", by: "providerRef", value: token } : null };
    }
    // Paiement : IPN `application/x-www-form-urlencoded`, données sous `data[...]`.
    const params = new URLSearchParams(rawBody);
    const hash = params.get("data[hash]");
    if (!hash || !safeEqual(hash, expected)) return { valid: false, lookup: null };
    const invoiceToken = params.get("data[invoice][token]");
    if (invoiceToken) return { valid: true, lookup: { kind: "payment", by: "providerRef", value: invoiceToken } };
    const disburseToken = params.get("data[token]");
    return { valid: true, lookup: disburseToken ? { kind: "payout", by: "providerRef", value: disburseToken } : null };
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "PAYDUNYA-MASTER-KEY": this.config.masterKey,
      "PAYDUNYA-PRIVATE-KEY": this.config.privateKey,
      "PAYDUNYA-TOKEN": this.config.token,
    };
  }
}
