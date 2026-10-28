import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizePhone, sha512Hex, type PayoutRequest, type RefundRequest } from "@pont-bj/core";
import { FedaPayAdapter } from "@pont-bj/adapter-fedapay";
import { PawaPayAdapter } from "@pont-bj/adapter-pawapay";
import { PayDunyaAdapter } from "@pont-bj/adapter-paydunya";
import { KkiapayAdapter } from "@pont-bj/adapter-kkiapay";
import { mockFetch, networkError } from "./helpers.js";

const payoutRequest = (overrides: Partial<PayoutRequest["input"]> = {}): PayoutRequest => ({
  attemptId: "11111111-2222-4333-8444-555555555555",
  callbackUrl: "https://marchand.bj/pont/hooks",
  input: {
    amount: 2000,
    currency: "XOF",
    country: "BJ",
    operator: "mtn_bj",
    recipient: { phone: "+2290197000001", name: "Koffi Agbo" },
    reference: "po_1",
    ...overrides,
  },
});

const refundRequest = (overrides: Partial<RefundRequest> = {}): RefundRequest => ({
  payment: { attemptId: "dep-1", providerRef: "tx_1", amount: 5000, currency: "XOF" },
  attemptId: "ref-1",
  amount: 5000,
  currency: "XOF",
  full: true,
  ...overrides,
});

describe("FedaPay — retraits", () => {
  it("crée puis démarre le payout (PUT /payouts/start)", async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: { "v1/payout": { id: 23, status: "pending" } } },
      { status: 200, body: {} },
    ]);
    const outcome = await new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch }).createPayout(payoutRequest());
    expect(outcome).toEqual({ kind: "ok", value: { providerRef: "23", status: "processing" } });
    expect(calls[1]).toMatchObject({ method: "PUT", url: "https://sandbox-api.fedapay.com/v1/payouts/start" });
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({ payouts: [{ id: 23 }] });
    expect(JSON.parse(calls[0]?.body ?? "{}").mode).toBe("mtn_open"); // code officiel (payment-methods.md)
  });

  it("timeout au démarrage → ambigu ; échec à la création → sans risque", async () => {
    const a = mockFetch([{ status: 201, body: { id: 1 } }, networkError("ETIMEDOUT")]);
    expect((await new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch: a.fetch }).createPayout(payoutRequest())).kind).toBe("ambiguous");
    const b = mockFetch([{ status: 502, body: {} }]);
    expect((await new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch: b.fetch }).createPayout(payoutRequest())).kind).toBe("unavailable_before_push");
  });

  it("statuts documentés : sent → succeeded, started → processing", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: { id: 23, status: "sent", amount: 2000, currency: { iso: "XOF" } } },
      { status: 200, body: { id: 23, status: "started" } },
    ]);
    const adapter = new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh", fetch });
    expect(await adapter.verifyPayout({ attemptId: "a", providerRef: "23" })).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 2000 } });
    expect(await adapter.verifyPayout({ attemptId: "a", providerRef: "23" })).toMatchObject({ kind: "ok", value: { status: "processing" } });
  });
});

describe("PawaPay — retraits et remboursements", () => {
  it("payout : payoutId = attemptId, recipient MMO", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { payoutId: "x", status: "ACCEPTED" } }]);
    const outcome = await new PawaPayAdapter({ mode: "test", apiToken: "t", fetch }).createPayout(payoutRequest());
    expect(outcome).toEqual({ kind: "ok", value: { providerRef: payoutRequest().attemptId, status: "pending" } });
    expect(calls[0]?.url).toBe("https://api.sandbox.pawapay.io/v2/payouts");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      payoutId: payoutRequest().attemptId,
      amount: "2000",
      recipient: { type: "MMO", accountDetails: { phoneNumber: "2290197000001", provider: "MTN_MOMO_BEN" } },
    });
  });

  it("remboursement total : uniquement refundId + depositId (doc)", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { status: "ACCEPTED" } }]);
    await new PawaPayAdapter({ mode: "test", apiToken: "t", fetch }).createRefund(refundRequest());
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ refundId: "ref-1", depositId: "dep-1" });
  });

  it("remboursement partiel : amount + currency ; rejet AMOUNT_TOO_LARGE lu dans rejectionReason", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { status: "ACCEPTED" } },
      { status: 200, body: { status: "REJECTED", rejectionReason: { rejectionCode: "AMOUNT_TOO_LARGE", rejectionMessage: "trop" } } },
    ]);
    const adapter = new PawaPayAdapter({ mode: "test", apiToken: "t", fetch });
    await adapter.createRefund(refundRequest({ amount: 30, full: false }));
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ refundId: "ref-1", depositId: "dep-1", amount: "30", currency: "XOF" });
    expect(await adapter.createRefund(refundRequest({ amount: 9999, full: false }))).toMatchObject({ kind: "rejected", code: "AMOUNT_TOO_LARGE" });
  });

  it("vérifie un payout (GET /v2/payouts/{id})", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { status: "FOUND", data: { payoutId: "p", status: "COMPLETED", amount: "2000", currency: "XOF" } } }]);
    expect(await new PawaPayAdapter({ mode: "test", apiToken: "t", fetch }).verifyPayout({ attemptId: "p", providerRef: "p" })).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 2000 } });
    expect(calls[0]?.url).toBe("https://api.sandbox.pawapay.io/v2/payouts/p");
  });

  it("callback de payout reconnu comme payout", async () => {
    const check = await new PawaPayAdapter({ mode: "test", apiToken: "t" }).checkWebhook(new Headers(), JSON.stringify({ payoutId: "p", status: "COMPLETED" }));
    expect(check).toEqual({ valid: true, lookup: { kind: "payout", by: "attemptId", value: "p" } });
  });

  it("numéros de test PawaPay du Bénin (8 chiffres) acceptés en sandbox seulement", () => {
    expect(normalizePhone("22951345789", "BJ", { allowLegacyBenin: true }).msisdn).toBe("22951345789");
    expect(() => normalizePhone("22951345789", "BJ")).toThrow();
  });
});

describe("PawaPay — callbacks signés RFC 9421", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const url = "https://marchand.bj/pont/hooks/pawapay";
  const body = JSON.stringify({ depositId: "4985d482-454d-4ebc-abc9-ad525eef21b6", status: "COMPLETED" });
  const nowSeconds = 1_714_657_560;

  /** Construit un callback signé exactement comme l'exemple de la doc PawaPay. */
  function signedHeaders(overrides: { body?: string; created?: number; keyid?: string } = {}) {
    const digest = `sha-512=:${createHash("sha512").update(body).digest("base64")}:`;
    const signatureDate = "2024-05-02T16:45:51.131905Z";
    const created = overrides.created ?? 1_714_657_551;
    const params = `("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="ecdsa-p256-sha256";keyid="${overrides.keyid ?? "HTTP_EC_P256_KEY:1"}";created=${created};expires=${created + 60}`;
    const base = [
      `"@method": POST`,
      `"@authority": marchand.bj`,
      `"@path": /pont/hooks/pawapay`,
      `"signature-date": ${signatureDate}`,
      `"content-digest": ${digest}`,
      `"content-type": application/json; charset=UTF-8`,
      `"@signature-params": ${params}`,
    ].join("\n");
    const signature = createSign("sha256").update(base).sign(privateKey).toString("base64"); // DER, comme `MEQCI…` dans la doc
    return new Headers({
      "content-type": "application/json; charset=UTF-8",
      "content-digest": digest,
      "signature-date": signatureDate,
      signature: `sig-pp=:${signature}:`,
      "signature-input": `sig-pp=${params}`,
    });
  }

  const adapter = () => new PawaPayAdapter({ mode: "live", apiToken: "t", callbackPublicKeys: { "HTTP_EC_P256_KEY:1": pem }, now: () => nowSeconds * 1000 });

  it("accepte un callback correctement signé", async () => {
    const check = await adapter().checkWebhook(signedHeaders(), body, { method: "POST", url });
    expect(check).toMatchObject({ valid: true, lookup: { kind: "payment", value: "4985d482-454d-4ebc-abc9-ad525eef21b6" } });
  });

  it("rejette : corps modifié, mauvaise URL, clé inconnue, signature absente, signature expirée, sans contexte", async () => {
    const a = adapter();
    const tampered = body.replace("COMPLETED", "FAILED");
    expect((await a.checkWebhook(signedHeaders(), tampered, { method: "POST", url })).valid).toBe(false);
    expect((await a.checkWebhook(signedHeaders(), body, { method: "POST", url: "https://marchand.bj/autre" })).valid).toBe(false);
    expect((await a.checkWebhook(signedHeaders({ keyid: "AUTRE" }), body, { method: "POST", url })).valid).toBe(false);
    expect((await a.checkWebhook(new Headers(), body, { method: "POST", url })).valid).toBe(false);
    expect((await a.checkWebhook(signedHeaders({ created: nowSeconds - 3_600 }), body, { method: "POST", url })).valid).toBe(false);
    expect((await a.checkWebhook(signedHeaders(), body)).valid).toBe(false);
  });
});

describe("PayDunya — retraits", () => {
  const config = { mode: "test" as const, masterKey: "mk", privateKey: "pk", token: "tk", storeName: "Boutique" };

  it("get-invoice puis submit-invoice ; numéro sans indicatif ; withdraw_mode documenté", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { response_code: "00", disburse_token: "hwTHAS" } },
      { status: 200, body: { response_code: "00", response_text: "Transaction completed successfully", transaction_id: "TFA-TX" } },
    ]);
    const outcome = await new PayDunyaAdapter({ ...config, fetch }).createPayout(payoutRequest({ country: "SN", operator: "wave_sn", recipient: { phone: "+221771111111" } }));
    expect(outcome).toEqual({ kind: "ok", value: { providerRef: "hwTHAS", status: "processing" } });
    expect(calls[0]?.url).toBe("https://app.paydunya.com/api/v2/disburse/get-invoice");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ account_alias: "771111111", amount: 2000, withdraw_mode: "wave-senegal", callback_url: "https://marchand.bj/pont/hooks" });
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({ disburse_invoice: "hwTHAS", disburse_id: payoutRequest().attemptId });
  });

  it("timeout à la soumission → ambigu ; check-status success → succeeded", async () => {
    const a = mockFetch([{ status: 200, body: { response_code: "00", disburse_token: "t" } }, networkError("ETIMEDOUT")]);
    expect((await new PayDunyaAdapter({ ...config, fetch: a.fetch }).createPayout(payoutRequest())).kind).toBe("ambiguous");
    const b = mockFetch([{ status: 200, body: { response_code: "00", status: "success", amount: "2000.00" } }]);
    expect(await new PayDunyaAdapter({ ...config, fetch: b.fetch }).verifyPayout({ attemptId: "a", providerRef: "t" })).toMatchObject({ kind: "ok", value: { status: "succeeded", amount: 2000 } });
  });

  it("refuse XAF et les opérateurs non listés", async () => {
    const adapter = new PayDunyaAdapter(config);
    expect(await adapter.createPayout(payoutRequest({ currency: "XAF" }))).toMatchObject({ kind: "rejected", code: "currency_not_supported" });
    expect(adapter.supports("SN", "wizall_sn", "payout")).toBe(false);
  });

  it("callback de retrait JSON reconnu comme payout", async () => {
    const check = await new PayDunyaAdapter(config).checkWebhook(new Headers(), JSON.stringify({ hash: sha512Hex("mk"), status: "success", token: "hwTHAS" }));
    expect(check).toEqual({ valid: true, lookup: { kind: "payout", by: "providerRef", value: "hwTHAS" } });
  });
});

describe("Kkiapay — remboursement", () => {
  const config = { mode: "test" as const, publicKey: "pk", privateKey: "pv", secretKey: "sk", webhookSecret: "wh" };

  it("appelle /transactions/revert avec les trois clés, reste processing (pas de suivi documenté)", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: {} }]);
    const outcome = await new KkiapayAdapter({ ...config, fetch }).createRefund(refundRequest());
    expect(outcome).toEqual({ kind: "ok", value: { providerRef: "tx_1", status: "processing" } });
    expect(calls[0]?.url).toBe("https://api-sandbox.kkiapay.me/api/v1/transactions/revert");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ transactionId: "tx_1" });
  });

  it("refuse le remboursement partiel", async () => {
    expect(await new KkiapayAdapter(config).createRefund(refundRequest({ full: false, amount: 100 }))).toMatchObject({ kind: "rejected", code: "partial_refund_not_supported" });
  });
});
