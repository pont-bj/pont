import { describe, expect, it } from "vitest";
import { hmacSha256Hex, sha512Hex, type DepositRequest } from "@pont/core";
import { FedaPayAdapter } from "@pont/adapter-fedapay";
import { PawaPayAdapter } from "@pont/adapter-pawapay";
import { PayDunyaAdapter } from "@pont/adapter-paydunya";
import { KkiapayAdapter } from "@pont/adapter-kkiapay";
import { CinetPayAdapter } from "@pont/adapter-cinetpay";
import { mockFetch, networkError } from "./helpers.js";

const request = (overrides: Partial<DepositRequest["input"]> = {}): DepositRequest => ({
  attemptId: "6f1c2b4e-0000-4000-8000-000000000001",
  callbackUrl: "https://marchand.bj/pont/hooks",
  input: {
    amount: 5000,
    currency: "XOF",
    country: "BJ",
    customer: { phone: "+2290197000001", name: "Awa Kpossou" },
    reference: "order_1",
    ...overrides,
  },
});

describe("FedaPay", () => {
  it("checkout hébergé : crée la transaction puis le token, renvoie une redirection", async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { "v1/transaction": { id: 4242, status: "pending" } } },
      { status: 200, body: { token: "tok_1", url: "https://process.fedapay.com/tok_1" } },
    ]);
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk_sandbox_x", webhookSecret: "wh", fetch });
    const outcome = await adapter.createDeposit(request());
    expect(outcome).toEqual({ kind: "ok", value: { providerRef: "4242", nextAction: { type: "redirect", url: "https://process.fedapay.com/tok_1" } } });
    expect(calls[0]?.url).toBe("https://sandbox-api.fedapay.com/v1/transactions");
    expect(calls[0]?.headers.authorization).toBe("Bearer sk_sandbox_x");
    expect(JSON.parse(calls[0]?.body ?? "{}").custom_metadata.pont_attempt_id).toBe(request().attemptId);
  });

  it("une panne à la création est sans risque (failover possible)", async () => {
    const { fetch } = mockFetch([{ status: 503, body: {} }]);
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch });
    expect((await adapter.createDeposit(request())).kind).toBe("unavailable_before_push");
  });

  it("paiement direct : un timeout après l'envoi est ambigu", async () => {
    const { fetch } = mockFetch([
      { status: 201, body: { id: 1 } },
      { status: 200, body: { token: "tok", url: "https://u" } },
      networkError("ETIMEDOUT"),
    ]);
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch });
    const outcome = await adapter.createDeposit(request({ method: "mobile_money", operator: "mtn_bj" }));
    expect(outcome.kind).toBe("ambiguous");
  });

  it("paiement direct MTN Bénin : mode officiel `mtn_open` ; couverture selon la page Payment Methods", async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { id: 1 } },
      { status: 200, body: { token: "tok", url: "https://u" } },
      { status: 200, body: {} },
    ]);
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch });
    await adapter.createDeposit(request({ method: "mobile_money", operator: "mtn_bj" }));
    expect(calls[2]?.url).toBe("https://sandbox-api.fedapay.com/v1/transactions/mtn_open");
    expect(adapter.supports("SN", "wave_sn", "deposit")).toBe(true); // checkout hébergé
    expect(adapter.supports("SN", "expresso_sn", "deposit")).toBe(false);
    expect(adapter.supports("ML", "moov_ml", "deposit")).toBe(false); // Mali : Orange uniquement
    expect(adapter.supports("SN", "free_sn", "payout")).toBe(false); // pas dans la liste des retraits
  });

  it("vérifie : approved → succeeded avec montant et tentative", async () => {
    const { fetch } = mockFetch([{ status: 200, body: { "v1/transaction": { id: 1, status: "approved", amount: 5000, currency: { iso: "XOF" }, custom_metadata: { pont_attempt_id: "a1" } } } }]);
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch });
    const outcome = await adapter.verify({ attemptId: "a1", providerRef: "1" });
    expect(outcome).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 5000, currency: "XOF", attemptRef: "a1" } });
  });

  it("webhook : accepte la signature officielle t=…,s=… et rejette une signature forgée", async () => {
    const body = JSON.stringify({ name: "transaction.approved", entity: { id: 99 } });
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh_fp", now: () => 1_000_000 });
    const good = new Headers({ "x-fedapay-signature": `t=1000,s=${hmacSha256Hex("wh_fp", `1000.${body}`)}` });
    expect(await adapter.checkWebhook(good, body)).toEqual({ valid: true, lookup: { kind: "payment", by: "providerRef", value: "99" } });
    const forged = new Headers({ "x-fedapay-signature": `t=1000,s=${hmacSha256Hex("autre", `1000.${body}`)}` });
    expect((await adapter.checkWebhook(forged, body)).valid).toBe(false);
  });
});

describe("PawaPay", () => {
  const adapter = (responses: Parameters<typeof mockFetch>[0]) => {
    const mocked = mockFetch(responses);
    return { adapter: new PawaPayAdapter({ mode: "test", apiToken: "tok", fetch: mocked.fetch }), calls: mocked.calls };
  };

  it("exige un opérateur couvert", () => {
    const { adapter: a } = adapter([]);
    expect(a.supports("BJ", null, "deposit")).toBe(false);
    expect(a.supports("BJ", "mtn_bj", "deposit")).toBe(true);
    expect(a.supports("TG", "moov_tg", "deposit")).toBe(false);
    expect(a.supports("BF", "orange_bf", "deposit")).toBe(true); // PREAUTH : code requis à la création
  });

  it("envoie depositId = attemptId, montant en chaîne, MSISDN sans +", async () => {
    const { adapter: a, calls } = adapter([{ status: 200, body: { depositId: "x", status: "ACCEPTED" } }]);
    const outcome = await a.createDeposit(request({ operator: "mtn_bj" }));
    expect(outcome.kind).toBe("ok");
    const sent = JSON.parse(calls[0]?.body ?? "{}");
    expect(sent).toMatchObject({ depositId: request().attemptId, amount: "5000", payer: { accountDetails: { phoneNumber: "2290197000001", provider: "MTN_MOMO_BEN" } } });
  });

  it("Orange Burkina (PREAUTH) : code exigé, puis transmis dans preAuthorisationCode", async () => {
    const { adapter: a, calls } = adapter([{ status: 200, body: { status: "ACCEPTED" } }]);
    const bf = { country: "BF" as const, operator: "orange_bf" as const, customer: { phone: "+22673394446" } };
    expect(await a.createDeposit(request(bf))).toMatchObject({ kind: "rejected", code: "preauth_code_required", message: expect.stringContaining("*144*4*6#") });
    expect(calls).toHaveLength(0);
    await a.createDeposit(request({ ...bf, preAuthorisationCode: "367025" }));
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ preAuthorisationCode: "367025", payer: { accountDetails: { provider: "ORANGE_BFA", phoneNumber: "22673394446" } } });
  });

  it("PROVIDER_TEMPORARILY_UNAVAILABLE autorise le failover, un autre refus non", async () => {
    const { adapter: a } = adapter([
      { status: 200, body: { status: "REJECTED", failureReason: { failureCode: "PROVIDER_TEMPORARILY_UNAVAILABLE" } } },
      { status: 200, body: { status: "REJECTED", failureReason: { failureCode: "AMOUNT_OUT_OF_BOUNDS", failureMessage: "trop" } } },
    ]);
    expect((await a.createDeposit(request({ operator: "mtn_bj" }))).kind).toBe("unavailable_before_push");
    expect(await a.createDeposit(request({ operator: "mtn_bj" }))).toMatchObject({ kind: "rejected", code: "AMOUNT_OUT_OF_BOUNDS" });
  });

  it("HTTP 500 (UNKNOWN_ERROR) est ambigu, jamais un échec", async () => {
    const { adapter: a } = adapter([{ status: 500, body: { failureReason: { failureCode: "UNKNOWN_ERROR" } } }]);
    expect((await a.createDeposit(request({ operator: "mtn_bj" }))).kind).toBe("ambiguous");
  });

  it("vérifie : COMPLETED → succeeded ; NOT_FOUND → failed", async () => {
    const { adapter: a } = adapter([
      { status: 200, body: { status: "FOUND", data: { depositId: "a1", status: "COMPLETED", amount: "5000", currency: "XOF" } } },
      { status: 200, body: { status: "NOT_FOUND" } },
    ]);
    expect(await a.verify({ attemptId: "a1", providerRef: "a1" })).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 5000, attemptRef: "a1" } });
    expect(await a.verify({ attemptId: "a2", providerRef: null })).toMatchObject({ kind: "ok", value: { status: "failed", failureCode: "not_found" } });
  });

  it("callback : rejette un Content-Digest qui ne correspond pas", async () => {
    const { adapter: a } = adapter([]);
    const body = JSON.stringify({ depositId: "a1", status: "COMPLETED" });
    expect((await a.checkWebhook(new Headers({ "content-digest": "sha-512=:AAAA:" }), body)).valid).toBe(false);
    expect(await a.checkWebhook(new Headers(), body)).toEqual({ valid: true, lookup: { kind: "payment", by: "attemptId", value: "a1" } });
  });
});

describe("PayDunya", () => {
  const config = { mode: "test" as const, masterKey: "mk", privateKey: "pk", token: "tk", storeName: "Boutique" };

  it("crée une facture et renvoie l'URL de paiement", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { response_code: "00", response_text: "https://app.paydunya.com/sandbox-checkout/invoice/test_x", token: "test_x" } }]);
    const outcome = await new PayDunyaAdapter({ ...config, fetch }).createDeposit(request({ country: "SN", customer: { phone: "+221771234567" } }));
    expect(outcome).toEqual({ kind: "ok", value: { providerRef: "test_x", nextAction: { type: "redirect", url: "https://app.paydunya.com/sandbox-checkout/invoice/test_x" } } });
    expect(calls[0]?.url).toBe("https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create");
    expect(calls[0]?.headers["paydunya-master-key"]).toBe("mk");
  });

  it("vérifie via confirm : completed → succeeded", async () => {
    const { fetch } = mockFetch([{ status: 200, body: { response_code: "00", status: "completed", invoice: { total_amount: 5000 }, custom_data: { pont_attempt_id: "a1" } } }]);
    const outcome = await new PayDunyaAdapter({ ...config, fetch }).verify({ attemptId: "a1", providerRef: "test_x" });
    expect(outcome).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 5000, attemptRef: "a1" } });
  });

  it("IPN : hash = SHA-512(master key)", async () => {
    const adapter = new PayDunyaAdapter(config);
    const body = new URLSearchParams({ "data[hash]": sha512Hex("mk"), "data[invoice][token]": "test_x", "data[status]": "completed" }).toString();
    expect(await adapter.checkWebhook(new Headers(), body)).toEqual({ valid: true, lookup: { kind: "payment", by: "providerRef", value: "test_x" } });
    const forged = new URLSearchParams({ "data[hash]": sha512Hex("autre"), "data[invoice][token]": "test_x" }).toString();
    expect((await adapter.checkWebhook(new Headers(), forged)).valid).toBe(false);
  });
});

describe("Kkiapay", () => {
  const config = { mode: "test" as const, publicKey: "pk", privateKey: "pv", secretKey: "sk", webhookSecret: "hash_secret" };

  it("renvoie un widget front avec montant serveur et partnerId = attemptId", async () => {
    const outcome = await new KkiapayAdapter(config).createDeposit(request());
    expect(outcome).toMatchObject({ kind: "ok", value: { providerRef: null, nextAction: { type: "client_widget", amount: 5000, partnerId: request().attemptId, sandbox: true } } });
  });

  it("vérifie via l'API status avec les trois clés", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { status: "SUCCESS", amount: 5000, partnerId: "a1" } }]);
    const outcome = await new KkiapayAdapter({ ...config, fetch }).verify({ attemptId: "a1", providerRef: "tx_1" });
    expect(outcome).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 5000, attemptRef: "a1" } });
    expect(calls[0]?.url).toBe("https://api-sandbox.kkiapay.me/api/v1/transactions/status");
    expect(calls[0]?.headers["x-private-key"]).toBe("pv");
  });

  it("webhook : contrôle x-kkiapay-secret", async () => {
    const adapter = new KkiapayAdapter(config);
    const body = JSON.stringify({ transactionId: "tx_1", isPaymentSucces: true });
    expect((await adapter.checkWebhook(new Headers({ "x-kkiapay-secret": "hash_secret" }), body)).valid).toBe(true);
    expect((await adapter.checkWebhook(new Headers({ "x-kkiapay-secret": "faux" }), body)).valid).toBe(false);
  });
});

describe("CinetPay (expérimental)", () => {
  it("refuse explicitement un montant non multiple de 5 (R-008)", async () => {
    const outcome = await new CinetPayAdapter({ mode: "test", apiKey: "k", siteId: "1" }).createDeposit(request({ amount: 5001 }));
    expect(outcome).toMatchObject({ kind: "rejected", code: "amount_not_multiple_of_5" });
  });

  it("crée un paiement avec transaction_id = attemptId", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { code: "201", data: { payment_url: "https://checkout.cinetpay.com/x" } } }]);
    const outcome = await new CinetPayAdapter({ mode: "test", apiKey: "k", siteId: "1", fetch }).createDeposit(request());
    expect(outcome).toMatchObject({ kind: "ok", value: { providerRef: request().attemptId } });
    expect(JSON.parse(calls[0]?.body ?? "{}").transaction_id).toBe(request().attemptId);
  });
});
