import type { ProviderSpec } from "./spec.js";

export interface GeneratedFile {
  path: string;
  content: string;
}

const PHONE_PLANS: Record<string, { code: string; length: number }> = {
  BJ: { code: "229", length: 10 },
  TG: { code: "228", length: 8 },
  CI: { code: "225", length: 10 },
  SN: { code: "221", length: 9 },
  BF: { code: "226", length: 8 },
  ML: { code: "223", length: 8 },
  NE: { code: "227", length: 8 },
  GN: { code: "224", length: 9 },
  CM: { code: "237", length: 9 },
  CG: { code: "242", length: 9 },
  CD: { code: "243", length: 9 },
  GA: { code: "241", length: 8 },
};

const pascal = (id: string): string => id.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
const snakeUpper = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** Numéro national de test valide pour le pays (`+<indicatif><chiffres>`). */
function samplePhone(country: string): string {
  const plan = PHONE_PLANS[country];
  return plan ? `+${plan.code}${"1".repeat(plan.length)}` : "+0000000000";
}

function adapterSource(spec: ProviderSpec): string {
  const className = `${pascal(spec.id)}Adapter`;
  const keyUnion = spec.keys.map((key) => JSON.stringify(key)).join(" | ");
  return `// Adaptateur « ${spec.label} » généré par \`pont provider new\`.
// La description de l'intégration est la constante SPEC ci-dessous : corrigez-la ici ou relancez le générateur.
// Règles Pont respectées : un paiement ne devient \`succeeded\` qu'après verify() ; tout statut inconnu reste \`pending\` ;
// un échec après l'envoi est \`ambiguous\` (jamais de nouvel essai ailleurs) ; signature des webhooks comparée en temps constant ;
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
} from "@pont-bj/core";

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

const SPEC: Spec = ${json(spec)};

export type ${pascal(spec.id)}Key = ${keyUnion};

export type ${className}Config = { mode: Mode; webhookSecret: string; fetch?: FetchLike; now?: () => number } & Record<${pascal(spec.id)}Key, string>;

type Vars = Record<string, string | number | undefined>;

function render(value: Template, vars: Vars): Template {
  if (typeof value === "string") {
    const whole = /^\\{(\\w+)\\}$/.exec(value);
    if (whole) return vars[whole[1]!] ?? "";
    return value.replace(/\\{(\\w+)\\}/g, (_match, name: string) => String(vars[name] ?? ""));
  }
  if (Array.isArray(value)) return value.map((item) => render(item, vars));
  // Sans adresse de retour fournie par le marchand, le champ est omis (jamais remplacé par l'adresse du webhook).
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => !(item === "{returnUrl}" && vars["returnUrl"] === undefined)).map(([key, item]) => [key, render(item, vars)]));
  return value;
}

const renderPath = (path: string, vars: Vars): string => path.replace(/\\{(\\w+)\\}/g, (_match, name: string) => encodeURIComponent(String(vars[name] ?? "")));
const pick = (value: unknown, path: string | undefined): string | null => (path ? stringField(value, ...path.split(".")) : null);
const pickNumber = (value: unknown, path: string | undefined): number | null => (path ? numberField(value, ...path.split(".")) : null);

export class ${className} implements ProviderAdapter {
  readonly id: ProviderId = SPEC.id as ProviderId;
  readonly mode: Mode;
  private readonly config: ${className}Config;
  private readonly fetchImpl: FetchLike;

  constructor(config: ${className}Config) {
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
    if (!SPEC.currencies.includes(input.currency)) return { kind: "rejected", code: "currency_not_supported", message: \`Devise \${input.currency} non prise en charge par \${SPEC.label}.\` };
    const phone = normalizePhone(input.customer.phone, input.country);
    const vars: Vars = {
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      attemptId,
      callbackUrl: request.callbackUrl,
      returnUrl: input.returnUrl,
      phone: phone.e164,
      country: input.country,
      description: input.description ?? \`Commande \${input.reference}\`,
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
      if (!timestamp || !/^\\d+$/.test(timestamp)) return invalid;
      const now = Math.floor((this.config.now ?? Date.now)() / 1000);
      if (Math.abs(now - Number(timestamp)) > (webhook.toleranceSeconds ?? 300)) return invalid;
      signed = \`\${timestamp}.\${rawBody}\`;
    }
    const expected = \`\${webhook.prefix ?? ""}\${createHmac(webhook.algorithm, this.config.webhookSecret).update(signed, "utf8").digest(webhook.encoding)}\`;
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
    if (!endpoint) return { kind: "rejected", code: "payout_not_supported", message: \`\${SPEC.label} ne gère pas les retraits.\` };
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
      description: input.description ?? \`Retrait \${input.reference}\`,
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
    if (!endpoint) return { kind: "rejected", code: "refund_not_supported", message: \`\${SPEC.label} ne gère pas les remboursements.\` };
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
    if (!endpoint) return { kind: "rejected", code: "not_supported", message: \`\${SPEC.label} : vérification non configurée.\` };
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
    if (auth.type === "bearer") return { ...base, authorization: \`Bearer \${this.secret(auth.key)}\` };
    if (auth.type === "basic") {
      const credentials = \`\${this.secret(auth.userKey)}:\${auth.passKey ? this.secret(auth.passKey) : ""}\`;
      return { ...base, authorization: \`Basic \${Buffer.from(credentials, "utf8").toString("base64")}\` };
    }
    return { ...base, [auth.header]: this.secret(auth.key) };
  }

  /** Appel HTTP classé pour le failover : connexion impossible = sans risque, réponse 4xx = refus, le reste = ambigu. */
  private async call(endpoint: EndpointSpec, vars: Vars, missingRef = false): Promise<ProviderCallOutcome<unknown>> {
    if (missingRef) return { kind: "rejected", code: "missing_provider_ref", message: \`Opération \${SPEC.label} inconnue.\` };
    const body = endpoint.body === undefined ? undefined : JSON.stringify(render(endpoint.body, vars));
    const result = await requestJson(this.fetchImpl, \`\${SPEC.baseUrl[this.mode]}\${renderPath(endpoint.path, vars)}\`, {
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
      return { kind: "rejected", code: \`\${SPEC.id}_\${result.status}\`, message: stringField(result.body, "message") ?? \`Requête refusée par \${SPEC.label}.\` };
    }
    return { kind: "ambiguous", reason: \`HTTP \${result.status}\` };
  }
}

// \`field\` est ré-exporté pour que vos ajustements manuels disposent de la lecture sûre de JSON.
export { field };
`;
}

function testSource(spec: ProviderSpec): string {
  const className = `${pascal(spec.id)}Adapter`;
  const country = spec.countries[0]!;
  const phone = samplePhone(country);
  const w = spec.webhook;
  const keyEntries = spec.keys.map((key) => `${key}: "secret_${key}_123456"`).join(", ");
  const nested = (path: string, value: string): string => `nested(${JSON.stringify(path)}, ${value})`;
  const verifyStatuses = Object.entries(spec.statusMap);
  const hasTransfers = Boolean(spec.payout || spec.refund);
  return `// Tests générés avec un FAUX serveur (fetch injecté) : ils prouvent que l'adaptateur applique votre description,
// pas que l'agrégateur réel répond ainsi. Testez en sandbox de l'agrégateur avant tout usage réel.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ${className} } from "../src/index.js";

const SECRET = "whsec_test_123456";
const KEYS = { ${keyEntries} };

function nested(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  const root: Record<string, unknown> = {};
  let cursor = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else cursor = (cursor[part] = {}) as Record<string, unknown>;
  });
  return root;
}

function merge(...parts: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      const current = out[key];
      out[key] = typeof value === "object" && value !== null && typeof current === "object" && current !== null ? merge(current as Record<string, unknown>, value as Record<string, unknown>) : value;
    }
  }
  return out;
}

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function fakeServer(reply: (request: Seen) => { status: number; body?: unknown } | Error) {
  const seen: Seen[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const request: Seen = { url, method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === "string" ? init.body : undefined };
    seen.push(request);
    const answer = reply(request);
    if (answer instanceof Error) throw answer;
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
  };
  return { fetch, seen };
}

const adapter = (fetch: (url: string, init?: RequestInit) => Promise<Response>, now?: () => number) =>
  new ${className}({ mode: "test", webhookSecret: SECRET, ...KEYS, fetch, ...(now ? { now } : {}) });

const deposit = {
  input: { amount: 5000, currency: ${JSON.stringify(spec.currencies[0])} as const, country: ${JSON.stringify(country)} as const, customer: { phone: ${JSON.stringify(phone)}, name: "Awa Test" }, reference: "cmd-1" },
  attemptId: "att_1",
  callbackUrl: "https://boutique.exemple/hooks",
};

describe(${JSON.stringify(`adaptateur ${spec.label}`)}, () => {
  it("couvre le pays configuré et refuse les autres", () => {
    const a = adapter(fakeServer(() => ({ status: 200 })).fetch);
    expect(a.supports(${JSON.stringify(country)}, null, "deposit")).toBe(true);
    expect(a.supports("GA", null, "deposit")).toBe(${spec.countries.includes("GA")});
  });

  it("crée un paiement : bon endpoint, authentification, corps rendu, identifiant récupéré", async () => {
    const server = fakeServer(() => ({ status: 200, body: merge(${nested(spec.deposit.response.providerRef, '"op_42"')}${spec.deposit.response.redirectUrl ? `, ${nested(spec.deposit.response.redirectUrl, '"https://pay.exemple/checkout/42"')}` : ""}) }));
    const result = await adapter(server.fetch).createDeposit(deposit);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value.providerRef).toBe("op_42");
      expect(result.value.nextAction.type).toBe(${spec.deposit.response.redirectUrl ? '"redirect"' : '"await_customer"'});
    }
    const call = server.seen[0]!;
    expect(call.method).toBe(${JSON.stringify(spec.deposit.method)});
    expect(call.url.startsWith(${JSON.stringify(spec.baseUrl.test)})).toBe(true);
    expect(call.headers[${JSON.stringify(spec.auth.type === "header" ? spec.auth.header.toLowerCase() : "authorization")}]).toBeTruthy();
${spec.deposit.body === undefined ? "" : "    expect(() => JSON.parse(call.body ?? \"\")).not.toThrow();\n    expect(call.body).not.toMatch(/\\{\\w+\\}/);\n"}  });

  it("un refus 4xx est un rejet explicite sans le secret", async () => {
    const server = fakeServer(() => ({ status: 422, body: { message: "Montant invalide" } }));
    const result = await adapter(server.fetch).createDeposit(deposit);
    expect(result).toEqual({ kind: "rejected", code: ${JSON.stringify(`${spec.id}_422`)}, message: "Montant invalide" });
  });

  it("connexion impossible : sans risque ; échec après envoi : ambigu", async () => {
    const down = adapter(fakeServer(() => Object.assign(new Error("dns"), { code: "ENOTFOUND" })).fetch);
    expect((await down.createDeposit(deposit)).kind).toBe("unavailable_before_push");
    const cut = adapter(fakeServer(() => new Error("reset")).fetch);
    expect((await cut.createDeposit(deposit)).kind).toBe("ambiguous");
    const broken = adapter(fakeServer(() => ({ status: 500 })).fetch);
    expect((await broken.createDeposit(deposit)).kind).toBe("ambiguous");
  });

  it("une réponse sans identifiant est ambiguë (la demande a pu partir)", async () => {
    const result = await adapter(fakeServer(() => ({ status: 200, body: {} })).fetch).createDeposit(deposit);
    expect(result.kind).toBe("ambiguous");
  });

  it("verify traduit chaque statut de l'agrégateur", async () => {
    const table: Array<[string, string]> = ${json(verifyStatuses)};
    for (const [raw, expected] of table) {
      const server = fakeServer(() => ({ status: 200, body: merge(${nested(spec.verify.response.status, "raw")}${spec.verify.response.amount ? `, ${nested(spec.verify.response.amount, "5000")}` : ""}${spec.verify.response.currency ? `, ${nested(spec.verify.response.currency, JSON.stringify(spec.currencies[0]))}` : ""}) }));
      const result = await adapter(server.fetch).verify({ attemptId: "att_1", providerRef: "op_42" });
      expect(result.kind).toBe("ok");
      if (result.kind === "ok") expect(result.value.status).toBe(expected);
      expect(server.seen[0]!.url).toContain("op_42");
    }
  });

  it("verify : un statut inconnu reste pending, jamais succeeded", async () => {
    const server = fakeServer(() => ({ status: 200, body: ${nested(spec.verify.response.status, '"STATUT_INCONNU"')} }));
    const result = await adapter(server.fetch).verify({ attemptId: "att_1", providerRef: "op_42" });
    expect(result.kind === "ok" && result.value.status).toBe("pending");
  });

  it("verify sans identifiant d'opération est refusé", async () => {
    const server = fakeServer(() => ({ status: 200 }));
    expect((await adapter(server.fetch).verify({ attemptId: "att_1", providerRef: null })).kind).toBe("rejected");
    expect(server.seen).toHaveLength(0);
  });

  describe("webhooks", () => {
    const now = 1_700_000_000;
    const body = JSON.stringify(merge(${nested(w.lookup.path, '"op_42"')}));
    const sign = (payload: string): string => \`${w.prefix ?? ""}\${createHmac(${JSON.stringify(w.algorithm)}, SECRET).update(payload, "utf8").digest(${JSON.stringify(w.encoding)})}\`;
    const headers = (signature: string, timestamp = now): Headers => {
      const h = new Headers({ ${JSON.stringify(w.header)}: signature });
${w.payload === "timestamp.body" ? `      h.set(${JSON.stringify(w.timestampHeader)}, String(timestamp));\n` : "      void timestamp;\n"}      return h;
    };
    const a = adapter(fakeServer(() => ({ status: 200 })).fetch, () => now * 1000);
    const signed = ${w.payload === "timestamp.body" ? "`${now}.${body}`" : "body"};

    it("accepte une signature valide et retrouve l'opération", async () => {
      const check = await a.checkWebhook(headers(sign(signed)), body);
      expect(check.valid).toBe(true);
      expect(check.lookup).toMatchObject({ by: ${JSON.stringify(w.lookup.by)}, value: "op_42" });
    });

    it("rejette une signature fausse, un corps modifié et l'absence d'en-tête", async () => {
      expect((await a.checkWebhook(headers("0".repeat(64)), body)).valid).toBe(false);
      expect((await a.checkWebhook(headers(sign(signed)), body.replace("op_42", "op_43"))).valid).toBe(false);
      expect((await a.checkWebhook(new Headers(), body)).valid).toBe(false);
    });
${w.payload === "timestamp.body" ? `
    it("rejette un horodatage hors tolérance (anti-rejeu)", async () => {
      const old = now - ${(w.toleranceSeconds ?? 300) + 60};
      expect((await a.checkWebhook(headers(sign(\`\${old}.\${body}\`), old), body)).valid).toBe(false);
    });
` : ""}  });
${hasTransfers ? transferTests(spec) : ""}});
`;
}

function transferTests(spec: ProviderSpec): string {
  const country = spec.countries[0]!;
  const out: string[] = [];
  if (spec.payout && spec.verifyPayout) {
    const operator = spec.operators?.[0] ?? `mtn_${country.toLowerCase()}`;
    out.push(`
  it("crée puis vérifie un retrait", async () => {
    const server = fakeServer((request) => (request.method === ${JSON.stringify(spec.payout.method)} && request.url.endsWith(${JSON.stringify(spec.payout.path.split("{")[0])}) ? { status: 200, body: nested(${JSON.stringify(spec.payout.response.providerRef)}, "po_7") } : { status: 200, body: nested(${JSON.stringify(spec.verifyPayout.response.status)}, ${JSON.stringify(Object.keys(spec.transferStatusMap ?? {})[0] ?? "x")}) }));
    const a = adapter(server.fetch);
    const created = await a.createPayout!({
      input: { amount: 3000, currency: ${JSON.stringify(spec.currencies[0])}, country: ${JSON.stringify(country)}, operator: ${JSON.stringify(operator)} as never, recipient: { phone: ${JSON.stringify(samplePhone(country))} }, reference: "ret-1" },
      attemptId: "att_p1",
      callbackUrl: "https://boutique.exemple/hooks",
    });
    expect(created.kind).toBe("ok");
    expect((await a.verifyPayout!({ attemptId: "att_p1", providerRef: "po_7" })).kind).toBe("ok");
  });
`);
  }
  if (spec.refund && spec.verifyRefund) {
    out.push(`
  it("crée puis vérifie un remboursement", async () => {
    const server = fakeServer((request) => (request.method === ${JSON.stringify(spec.refund.method)} && !request.url.includes("/rf_") ? { status: 200, body: nested(${JSON.stringify(spec.refund.response.providerRef)}, "rf_9") } : { status: 200, body: nested(${JSON.stringify(spec.verifyRefund.response.status)}, ${JSON.stringify(Object.keys(spec.transferStatusMap ?? {})[0] ?? "x")}) }));
    const a = adapter(server.fetch);
    const created = await a.createRefund!({ amount: 1000, currency: ${JSON.stringify(spec.currencies[0])}, payment: { attemptId: "att_1", providerRef: "op_42", amount: 5000, currency: ${JSON.stringify(spec.currencies[0])} }, attemptId: "att_r1", full: false });
    expect(created.kind).toBe("ok");
    expect((await a.verifyRefund!({ attemptId: "att_r1", providerRef: "rf_9" })).kind).toBe("ok");
  });
`);
  }
  return out.join("");
}

function readme(spec: ProviderSpec): string {
  const envPrefix = spec.id.toUpperCase();
  const className = `${pascal(spec.id)}Adapter`;
  const envs = [...spec.keys.map((key) => `${envPrefix}_${snakeUpper(key)}`), `${envPrefix}_WEBHOOK_SECRET`];
  const caps = ["paiement (deposit + verify)", ...(spec.payout ? ["retrait"] : []), ...(spec.refund ? ["remboursement"] : [])].join(", ");
  return `# Adaptateur Pont : ${spec.label}

Généré par \`pont provider new\`. Capacités : ${caps}. Pays : ${spec.countries.join(", ")}. Devises : ${spec.currencies.join(", ")}.

## À savoir avant de l'utiliser

- Les tests (\`pnpm test\`) utilisent un **faux serveur** : ils vérifient que l'adaptateur applique la description de l'intégration, pas que ${spec.label} répond réellement ainsi. Essayez-le avec le sandbox de l'agrégateur avant tout usage réel.
- Un paiement ne passe à \`succeeded\` qu'après \`verify()\`. Un statut absent de \`statusMap\` reste \`pending\`.
- Aucun secret n'est écrit dans le code : ils arrivent par la configuration.

## Utilisation

\`\`\`ts
import { ${className} } from "./src/index.js";

const adapter = new ${className}({
  mode: "test",
${spec.keys.map((key) => `  ${key}: process.env.${envPrefix}_${snakeUpper(key)}!,`).join("\n")}
  webhookSecret: process.env.${envPrefix}_WEBHOOK_SECRET!,
});
\`\`\`

Variables d'environnement conseillées : ${envs.map((name) => `\`${name}\``).join(", ")}.

Branchez l'adaptateur dans le moteur : \`new PontEngine({ adapters: [adapter, …], … })\`. L'agrégateur doit appeler \`<URL publique>/<chemin des webhooks>/${spec.id}\`.

## Serveur self-host

Copiez ce dossier dans le dossier des plugins du serveur (\`deploy/self-host/plugins/${spec.id}\`, ou \`PONT_PLUGINS_DIR\`) : le serveur le charge, la page Clés demande ${spec.keys.join(", ")} et le secret de webhook, et l'agrégateur appelle \`<URL publique>/hooks/${spec.id}\`. Le dossier doit contenir \`spec.json\` et \`src/index.ts\` (ou \`dist/index.js\`). Le serveur exécute ce code : ne chargez que du code que vous avez relu.

## Modifier l'intégration

Toute la description (endpoints, authentification, statuts, signature) est la constante \`SPEC\` en haut de \`src/index.ts\`. Corrigez-la, ou relancez \`pont provider new --from spec.json\` (le dossier existant n'est jamais écrasé sans \`--force\`).
`;
}

function packageJson(spec: ProviderSpec): string {
  return `${json({
    name: `pont-adapter-${spec.id.replace(/_/g, "-")}`,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "./src/index.ts",
    scripts: { typecheck: "tsc --noEmit -p .", test: "vitest run" },
    dependencies: { "@pont-bj/core": "*" },
    devDependencies: { "@types/node": "^22.0.0", typescript: "^5.6.0", vitest: "^2.1.8" },
  })}\n`;
}

const TSCONFIG = `${json({
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    esModuleInterop: true,
    skipLibCheck: true,
    types: ["node"],
  },
  include: ["src", "test"],
})}\n`;

/** Dossier autonome : package.json, tsconfig, adaptateur, tests, README et la description (`spec.json`) qui l'a produit. */
export function renderProvider(spec: ProviderSpec): GeneratedFile[] {
  return [
    { path: "package.json", content: packageJson(spec) },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "spec.json", content: `${json(spec)}\n` },
    { path: "src/index.ts", content: adapterSource(spec) },
    { path: "test/adapter.test.ts", content: testSource(spec) },
    { path: "README.md", content: readme(spec) },
  ];
}
