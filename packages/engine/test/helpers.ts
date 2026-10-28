import type {
  Capability,
  Country,
  DepositAccepted,
  DepositRequest,
  FetchLike,
  Mode,
  Operator,
  Payment,
  ProviderAdapter,
  ProviderCallOutcome,
  ProviderId,
  VerifiedState,
  WebhookCheck,
  Payout,
  PayoutRequest,
  Refund,
  RefundRequest,
  TransferAccepted,
  TransferVerified,
} from "@pont-bj/core";

/** Adaptateur programmable pour tester le moteur. */
export class FakeAdapter implements ProviderAdapter {
  readonly mode: Mode = "test";
  createCalls = 0;
  verifyCalls = 0;
  createOutcome: ProviderCallOutcome<DepositAccepted> = {
    kind: "ok",
    value: { providerRef: "ref_1", nextAction: { type: "await_customer", message: "ok" } },
  };
  verifyOutcome: ProviderCallOutcome<VerifiedState> = {
    kind: "ok",
    value: { status: "succeeded", amount: 5000, currency: "XOF", providerRef: "ref_1", failureCode: null },
  };
  lastRequest: DepositRequest | null = null;
  payoutOutcome: ProviderCallOutcome<TransferAccepted> = { kind: "ok", value: { providerRef: "po_ref", status: "processing" } };
  payoutVerify: ProviderCallOutcome<TransferVerified> = {
    kind: "ok",
    value: { status: "succeeded", amount: 2000, currency: "XOF", providerRef: "po_ref", failureCode: null },
  };
  refundOutcome: ProviderCallOutcome<TransferAccepted> = { kind: "ok", value: { providerRef: "re_ref", status: "pending" } };
  refundVerify: ProviderCallOutcome<TransferVerified> = {
    kind: "ok",
    value: { status: "succeeded", amount: null, currency: "XOF", providerRef: "re_ref", failureCode: null },
  };
  refundRequests: RefundRequest[] = [];

  async createPayout(_request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    return this.payoutOutcome;
  }

  async verifyPayout(_payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    return this.payoutVerify;
  }

  async createRefund(request: RefundRequest): Promise<ProviderCallOutcome<TransferAccepted>> {
    this.refundRequests.push(request);
    return this.refundOutcome;
  }

  async verifyRefund(_refund: Pick<Refund, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>> {
    return this.refundVerify;
  }

  constructor(readonly id: ProviderId, private readonly countries: Country[] = ["BJ"]) {}

  supports(country: Country, _operator: Operator | null, _capability: Capability): boolean {
    return this.countries.includes(country);
  }

  async createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>> {
    this.createCalls += 1;
    this.lastRequest = request;
    return this.createOutcome;
  }

  async verify(_payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>> {
    this.verifyCalls += 1;
    return this.verifyOutcome;
  }

  async checkWebhook(headers: Headers, rawBody: string): Promise<WebhookCheck> {
    if (headers.get("x-test-signature") !== "ok") return { valid: false, lookup: null };
    return { valid: true, lookup: { by: "providerRef", value: JSON.parse(rawBody).ref } };
  }
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** `fetch` simulé : renvoie les réponses dans l'ordre et enregistre les appels. */
export function mockFetch(responses: Array<{ status: number; body: unknown } | Error>): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = queue.shift();
    if (!next) throw new Error(`Appel inattendu : ${url}`);
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  };
  return { fetch: fetchImpl, calls };
}

export function networkError(code: string): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

export const baseInput = {
  amount: 5000,
  currency: "XOF",
  country: "BJ",
  customer: { phone: "+2290197000001", name: "Awa Kpossou" },
  reference: "order_4521",
} as const;
