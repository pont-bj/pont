// Adaptateur « MonAgrégateur » généré par `pont provider new`.
// La description de l'intégration est la constante SPEC ci-dessous : corrigez-la ici ou relancez le générateur.
// Règles Pont respectées : un paiement ne devient `succeeded` qu'après verify() ; tout statut inconnu reste `pending` ;
// un échec après l'envoi est `ambiguous` (jamais de nouvel essai ailleurs) ; signature des webhooks comparée en temps constant ;
// aucun secret dans les logs ni dans les erreurs.
import { createHmac } from "node:crypto";
import {
  field,
  normalizePhone,
  numberField,
  requestJson,
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
  type Payout,
  type PayoutRequest,
  type ProviderAdapter,
  type ProviderCallOutcome,
  type ProviderId,
  type Refund,
  type RefundRequest,
  type TransferAccepted,
  type TransferStatus,
  type TransferVerified,
  type VerifiedState,
  type WebhookCheck,
} from "@pont/core";

type Template = string | number | boolean | { [key: string]: Template } | Template[];

interface EndpointSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: Template;
  response: { providerRef?: string; redirectUrl?: string; status?: string; amount?: string; currency?: string; failureCode?: string; attemptRef?: string };
}

interface Spec {
  id: string;
  label: string;
  countries: string[];
  currencies: string[];
  operators?: string[];
  operatorCodes?: Record<string, string>;
  keys: string[];
  baseUrl: Record<Mode, string>;
  auth: { type: "bearer"; key: string } | { type: "basic"; userKey: string; passKey?: string } | { type: "header"; header: string; key: string };
  deposit: EndpointSpec;
  verify: EndpointSpec;
  payout?: EndpointSpec;
  verifyPayout?: EndpointSpec;
  refund?: EndpointSpec;
  verifyRefund?: EndpointSpec;
  statusMap: Record<string, PaymentStatus>;
  transferStatusMap?: Record<string, TransferStatus>;
  webhook: {
    header: string;
    algorithm: "sha256" | "sha512";
    encoding: "hex" | "base64";
    prefix?: string;
    payload: "body" | "timestamp.body";
    timestampHeader?: string;
    toleranceSeconds?: number;
    lookup: { path: string; by: "providerRef" | "attemptId"; kind?: "payment" | "payout" | "refund" };
  };
}

const SPEC: Spec = {
  "id": "monagregateur",
  "label": "MonAgrégateur",
  "countries": [
    "BJ",
    "TG"
  ],
  "currencies": [
    "XOF"
  ],
  "baseUrl": {
    "test": "https://sandbox.mon.test/v1",
    "live": "https://api.mon.test/v1"
  },
  "keys": [
    "secretKey"
  ],
  "auth": {
    "type": "bearer",
    "key": "secretKey"
  },
  "deposit": {
    "method": "POST",
    "path": "/payments",
    "body": {
      "amount": "{amount}",
      "currency": "{currency}",
      "phone": "{phone}",
      "merchant_ref": "{attemptId}",
      "callback": "{callbackUrl}"
    },
    "response": {
      "providerRef": "data.id"
    }
  },
  "verify": {
    "method": "GET",
    "path": "/payments/{providerRef}",
    "response": {
      "status": "data.status",
      "amount": "data.amount",
      "currency": "data.currency",
      "attemptRef": "data.merchant_ref"
    }
  },
  "statusMap": {
    "PAID": "succeeded",
    "FAILED": "failed",
    "WAITING": "pending"
  },
  "webhook": {
    "header": "X-Mon-Signature",
    "algorithm": "sha256",
    "encoding": "hex",
    "prefix": "sha256=",
    "payload": "body",
    "lookup": {
      "path": "data.id",
      "by": "providerRef"
    }
  }
};

export type MonagregateurKey = "secretKey";

export type MonagregateurAdapterConfig = { mode: Mode; webhookSecret: string; fetch?: FetchLike; now?: () => number } & Record<MonagregateurKey, string>;

type Vars = Record<string, string | number | undefined>;

function render(value: Template, vars: Vars): Template {
  if (typeof value === "string") {
    const whole = /^\{(\w+)\}$/.exec(value);
    if (whole) return vars[whole[1]!] ?? "";
    return value.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name] ?? ""));
  }
  if (Array.isArray(value)) return value.map((item) => render(item, vars));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item, vars)]));
  return value;
}

const renderPath = (path: string, vars: Vars): string => path.replace(/\{(\w+)\}/g, (_match, name: string) => encodeURIComponent(String(vars[name] ?? "")));
const pick = (value: unknown, path: string | undefined): string | null => (path ? stringField(value, ...path.split(".")) : null);
const pickNumber = (value: unknown, path: string | undefined): number | null => (path ? numberField(value, ...path.split(".")) : null);

export class MonagregateurAdapter implements ProviderAdapter {
  readonly id: ProviderId = SPEC.id as ProviderId;
  readonly mode: Mode;
  private readonly config: MonagregateurAdapterConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: MonagregateurAdapterConfig) {
    this.config = config;
    this.mode = config.mode;
    this.fetchImpl = config.fetch ?? fetch;
  }

  supports(country: Country, operator: Operator | null, capability: Capability): boolean {
    if (!SPEC.countries.includes(country)) return false;
    if (capability === "payout" && !SPEC.payout) return false;
    if (capability === "refund" && !SPEC.refund) return false;
    if (operator === null) return capability !== "payout";
    return SPEC.operators === undefined || SPEC.operators.includes(operator);
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    const { input, attemptId } = request;
    if (!SPEC.currencies.includes(input.currency)) return { kind: "rejected", code: "currency_not_supported", message: `Devise ${input.currency} non prise en charge par ${SPEC.label}.` };
    const phone = normalizePhone(input.customer.phone, input.country);
    const vars: Vars = {
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      attemptId,
      callbackUrl: input.returnUrl ?? request.callbackUrl,
      phone: phone.e164,
      country: input.country,
      description: input.description ?? `Commande ${input.reference}`,
      customerName: input.customer.name,
      customerEmail: input.customer.email,
      operator: this.operatorCode(input.operator),
    };
    // Un seul appel crée et déclenche la demande : tout échec après l'envoi est ambigu (R-005), seule une panne de connexion certaine est sans risque (R-006).
    const created = await this.call(SPEC.deposit, vars);
    if (created.kind !== "ok") return created;
    const providerRef = pick(created.value, SPEC.deposit.response.providerRef);
    if (!providerRef) return { kind: "ambiguous", reason: "réponse sans identifiant d'opération" };
    const redirect = pick(created.value, SPEC.deposit.response.redirectUrl);
    return {
      kind: "ok",
      value: { providerRef, nextAction: redirect ? { type: "redirect", url: redirect } : { type: "await_customer", message: "Validez le paiement sur votre téléphone." } },
    };
  }

  async verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    const result = await this.call(SPEC.verify, { providerRef: payment.providerRef ?? undefined, attemptId: payment.attemptId }, payment.providerRef === null);
    if (result.kind !== "ok") return result.kind === "rejected" ? result : { kind: "ambiguous", reason: result.reason };
    const raw = pick(result.value, SPEC.verify.response.status) ?? "";
    // Un statut inconnu n'est jamais un succès.
    const status: PaymentStatus = SPEC.statusMap[raw] ?? "pending";
    return {
      kind: "ok",
      value: {
        status,
        amount: pickNumber(result.value, SPEC.verify.response.amount),
        currency: pick(result.value, SPEC.verify.response.currency),
        providerRef: payment.providerRef,
        failureCode: status === "failed" || status === "cancelled" || status === "expired" ? pick(result.value, SPEC.verify.response.failureCode) ?? raw : null,
        attemptRef: pick(result.value, SPEC.verify.response.attemptRef),
      },
    };
  }

  async checkWebhook(headers: Headers, rawBody: string): Promise<WebhookCheck> {
    const invalid: WebhookCheck = { valid: false, lookup: null };
    const webhook = SPEC.webhook;
    const given = headers.get(webhook.header);
    if (!given) return invalid;
    let signed = rawBody;
    if (webhook.payload === "timestamp.body") {
      const timestamp = headers.get(webhook.timestampHeader ?? "");
      if (!timestamp || !/^\d+$/.test(timestamp)) return invalid;
      const now = Math.floor((this.config.now ?? Date.now)() / 1000);
      if (Math.abs(now - Number(timestamp)) > (webhook.toleranceSeconds ?? 300)) return invalid;
      signed = `${timestamp}.${rawBody}`;
    }
    const expected = `${webhook.prefix ?? ""}${createHmac(webhook.algorithm, this.config.webhookSecret).update(signed, "utf8").digest(webhook.encoding)}`;
    if (!safeEqual(given.trim(), expected)) return invalid;
    let body: unknown = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return invalid;
    }
    const value = pick(body, webhook.lookup.path);
    return { valid: true, lookup: value ? { ...(webhook.lookup.kind ? { kind: webhook.lookup.kind } : {}), by: webhook.lookup.by, value } : null };
  }

  async createPayout(request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const endpoint = SPEC.payout;
    if (!endpoint) return { kind: "rejected", code: "payout_not_supported", message: `${SPEC.label} ne gère pas les retraits.` };
    const { input, attemptId } = request;
    if (SPEC.operators && !SPEC.operators.includes(input.operator)) return { kind: "rejected", code: "operator_not_supported", message: "Opérateur non couvert." };
    const phone = normalizePhone(input.recipient.phone, input.country);
    const sent = await this.call(endpoint, {
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      attemptId,
      callbackUrl: request.callbackUrl,
      phone: phone.e164,
      country: input.country,
      description: input.description ?? `Retrait ${input.reference}`,
      recipientName: input.recipient.name,
      recipientEmail: input.recipient.email,
      operator: this.operatorCode(input.operator),
    });
    if (sent.kind !== "ok") return sent;
    const providerRef = pick(sent.value, endpoint.response.providerRef);
    if (!providerRef) return { kind: "ambiguous", reason: "réponse sans identifiant de retrait" };
    return { kind: "ok", value: { providerRef, status: "processing" } };
  }

  async verifyPayout(payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    return this.verifyTransfer(SPEC.verifyPayout, payout);
  }

  async createRefund(request: RefundRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    const endpoint = SPEC.refund;
    if (!endpoint) return { kind: "rejected", code: "refund_not_supported", message: `${SPEC.label} ne gère pas les remboursements.` };
    const sent = await this.call(endpoint, {
      amount: request.amount,
      currency: request.currency,
      attemptId: request.attemptId,
      paymentRef: request.payment.providerRef ?? undefined,
      paymentAttemptId: request.payment.attemptId,
    });
    if (sent.kind !== "ok") return sent;
    const providerRef = pick(sent.value, endpoint.response.providerRef);
    if (!providerRef) return { kind: "ambiguous", reason: "réponse sans identifiant de remboursement" };
    return { kind: "ok", value: { providerRef, status: "processing" } };
  }

  async verifyRefund(refund: Pick<Refund, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    return this.verifyTransfer(SPEC.verifyRefund, refund);
  }

  private async verifyTransfer(endpoint: EndpointSpec | undefined, record: { attemptId: string; providerRef: string | null }): Promise<ProviderCallOutcome<TransferVerified>> {
    if (!endpoint) return { kind: "rejected", code: "not_supported", message: `${SPEC.label} : vérification non configurée.` };
    const result = await this.call(endpoint, { providerRef: record.providerRef ?? undefined, attemptId: record.attemptId }, record.providerRef === null);
    if (result.kind !== "ok") return result.kind === "rejected" ? result : { kind: "ambiguous", reason: result.reason };
    const raw = pick(result.value, endpoint.response.status) ?? "";
    // Statut inconnu : l'opération reste en cours, jamais réglée par défaut.
    const status: TransferStatus = SPEC.transferStatusMap?.[raw] ?? "processing";
    return {
      kind: "ok",
      value: {
        status,
        amount: pickNumber(result.value, endpoint.response.amount),
        currency: pick(result.value, endpoint.response.currency),
        providerRef: record.providerRef,
        failureCode: status === "failed" || status === "cancelled" ? pick(result.value, endpoint.response.failureCode) ?? raw : null,
      },
    };
  }

  private operatorCode(operator: Operator | undefined): string | undefined {
    return operator === undefined ? undefined : SPEC.operatorCodes?.[operator] ?? operator;
  }

  private secret(name: string): string {
    const value = (this.config as Record<string, unknown>)[name];
    return typeof value === "string" ? value : "";
  }

  private headers(): Record<string, string> {
    const base = { "content-type": "application/json", accept: "application/json" };
    const auth = SPEC.auth;
    if (auth.type === "bearer") return { ...base, authorization: `Bearer ${this.secret(auth.key)}` };
    if (auth.type === "basic") {
      const credentials = `${this.secret(auth.userKey)}:${auth.passKey ? this.secret(auth.passKey) : ""}`;
      return { ...base, authorization: `Basic ${Buffer.from(credentials, "utf8").toString("base64")}` };
    }
    return { ...base, [auth.header]: this.secret(auth.key) };
  }

  /** Appel HTTP classé pour le failover : connexion impossible = sans risque, réponse 4xx = refus, le reste = ambigu. */
  private async call(endpoint: EndpointSpec, vars: Vars, missingRef = false): Promise<ProviderCallOutcome<unknown>> {
    if (missingRef) return { kind: "rejected", code: "missing_provider_ref", message: `Opération ${SPEC.label} inconnue.` };
    const body = endpoint.body === undefined ? undefined : JSON.stringify(render(endpoint.body, vars));
    const result = await requestJson(this.fetchImpl, `${SPEC.baseUrl[this.mode]}${renderPath(endpoint.path, vars)}`, {
      method: endpoint.method,
      headers: this.headers(),
      ...(body === undefined ? {} : { body }),
    });
    if (result.kind === "not_sent") return { kind: "unavailable_before_push", reason: result.reason };
    if (result.kind === "unknown") return { kind: "ambiguous", reason: result.reason };
    if (result.status >= 200 && result.status < 300) return { kind: "ok", value: result.body };
    // 429 : l'agrégateur n'a rien traité, un autre peut être essayé.
    if (result.status === 429) return { kind: "unavailable_before_push", reason: "HTTP 429" };
    if (result.status >= 400 && result.status < 500) {
      return { kind: "rejected", code: `${SPEC.id}_${result.status}`, message: stringField(result.body, "message") ?? `Requête refusée par ${SPEC.label}.` };
    }
    return { kind: "ambiguous", reason: `HTTP ${result.status}` };
  }
}

// `field` est ré-exporté pour que vos ajustements manuels disposent de la lecture sûre de JSON.
export { field };
