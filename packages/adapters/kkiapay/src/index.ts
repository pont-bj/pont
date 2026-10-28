import {
  requestJson,
  numberField,
  safeEqual,
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
  type RefundRequest,
  type TransferAccepted,
} from "@pont-bj/core";

// Doc : documentation officielle de l’agrégateur — fiche : docs/metier/agregateurs/kkiapay.md
// CGU Art. 18 : Kkiapay doit être le seul agrégateur du marchand (R-011, contrôlé par le moteur).
const BASE_URLS: Record<Mode, string> = {
  test: "https://api-sandbox.kkiapay.me",
  live: "https://api.kkiapay.me",
};

// Seuls SUCCESS et FAILED apparaissent dans la doc ; tout autre statut reste `pending`.
const STATUS_MAP: Record<string, PaymentStatus> = {
  SUCCESS: "succeeded",
  FAILED: "failed",
};

export interface KkiapayConfig {
  mode: Mode;
  publicKey: string;
  privateKey: string;
  secretKey: string;
  /** « Hash secret » saisi dans le dashboard, renvoyé tel quel dans `x-kkiapay-secret`. */
  webhookSecret: string;
  fetch?: FetchLike;
}

export class KkiapayAdapter implements ProviderAdapter {
  readonly id = "kkiapay" as const;
  readonly mode: Mode;
  private readonly config: KkiapayConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: KkiapayConfig) {
    this.config = config;
    this.mode = config.mode;
    this.fetchImpl = config.fetch ?? fetch;
  }

  supports(country: Country, operator: Operator | null, capability: Capability): boolean {
    if (country !== "BJ") return false;
    if (operator !== null && operator !== "mtn_bj" && operator !== "moov_bj") return false;
    return capability !== "payout"; // les retraits Kkiapay sont des virements vers le marchand, pas vers un client
  }

  /**
   * Kkiapay n'initie pas de paiement côté serveur : le client paie dans le widget front.
   * Le moteur rattache ensuite l'identifiant de transaction et vérifie montant + partnerId.
   */
  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    return {
      kind: "ok",
      value: {
        providerRef: null,
        // partnerId = attemptId : relu à la vérification pour empêcher de rattacher la transaction d'un autre paiement.
        nextAction: {
          type: "client_widget",
          provider: "kkiapay",
          publicKey: this.config.publicKey,
          sandbox: this.mode === "test",
          amount: request.input.amount,
          partnerId: request.attemptId,
        },
      },
    };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    if (!payment.providerRef) {
      return { kind: "ok", value: { status: "pending", amount: null, currency: null, providerRef: null, failureCode: null } };
    }
    const result = await requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}/api/v1/transactions/status`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ transactionId: payment.providerRef }),
    });
    if (result.kind !== "response" || result.status >= 500) return { kind: "ambiguous", reason: result.kind === "response" ? `HTTP ${result.status}` : result.reason };
    if (result.status >= 400) return { kind: "rejected", code: `kkiapay_${result.status}`, message: "Vérification refusée par Kkiapay." };
    const raw = stringField(result.body, "status") ?? "";
    const status = STATUS_MAP[raw] ?? "pending";
    return {
      kind: "ok",
      value: {
        status,
        amount: numberField(result.body, "amount"),
        currency: null, // non renvoyée par l'API status
        providerRef: payment.providerRef,
        failureCode: status === "failed" ? stringField(result.body, "failureCode") ?? raw : null,
        attemptRef: stringField(result.body, "partnerId"),
      },
    };
  }

  /**
   * Remboursement total (`/api/v1/transactions/revert`, utilisé par le SDK officiel). Mobile money réussi uniquement,
   * frais non remboursés. La doc ne décrit ni la réponse ni un suivi de statut : le remboursement reste `processing`
   * et doit être confirmé dans le dashboard Kkiapay.
   */
  async createRefund(request: RefundRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    if (!request.full) return { kind: "rejected", code: "partial_refund_not_supported", message: "Kkiapay ne rembourse que la totalité." };
    if (!request.payment.providerRef) return { kind: "rejected", code: "missing_provider_ref", message: "Transaction Kkiapay inconnue." };
    const result = await requestJson(this.fetchImpl, `${BASE_URLS[this.mode]}/api/v1/transactions/revert`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ transactionId: request.payment.providerRef }),
    });
    if (result.kind === "not_sent") return { kind: "unavailable_before_push", reason: result.reason };
    if (result.kind === "unknown" || result.status >= 500) return { kind: "ambiguous", reason: result.kind === "unknown" ? result.reason : `HTTP ${result.status}` };
    if (result.status >= 400) return { kind: "rejected", code: `kkiapay_${result.status}`, message: stringField(result.body, "reason") ?? "Remboursement refusé par Kkiapay." };
    return { kind: "ok", value: { providerRef: request.payment.providerRef, status: "processing" } };
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.config.publicKey,
      "x-private-key": this.config.privateKey,
      "x-secret-key": this.config.secretKey,
    };
  }

  /** `x-kkiapay-secret` contient le secret lui-même : simple contrôle d'origine, le statut est relu via `verify` (R-003). */
  async checkWebhook(headers: Headers, rawBody: string): Promise<WebhookCheck> {
    const secret = headers.get("x-kkiapay-secret");
    if (!secret || !safeEqual(secret, this.config.webhookSecret)) return { valid: false, lookup: null };
    let body: unknown = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { valid: false, lookup: null };
    }
    const transactionId = stringField(body, "transactionId");
    return { valid: true, lookup: transactionId ? { by: "providerRef", value: transactionId } : null };
  }
}
