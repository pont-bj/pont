import { describe, expect, it } from "vitest";
import { PontError, hmacSha256Hex } from "@pont-bj/core";
import { createCronRoute, createPontFromEnv, createWebhookRoute, handleProviderRequest } from "../src/index.js";

describe("createCronRoute", () => {
  const pont = () => createPontFromEnv({ env: { PONT_PUBLIC_URL: "https://boutique.bj", PONT_SANDBOX: "true" } });
  const call = (secret: string | undefined, auth?: string) =>
    createCronRoute(pont(), { secret }).GET(new Request("https://boutique.bj/api/pont/cron", { headers: auth ? { authorization: auth } : {} }));

  it("exige le secret cron", async () => {
    expect((await call(undefined)).status).toBe(500);
    expect((await call("c".repeat(32))).status).toBe(401);
    expect((await call("c".repeat(32), "Bearer faux")).status).toBe(401);
  });

  it("lance la réconciliation avec le bon secret", async () => {
    const response = await call("c".repeat(32), `Bearer ${"c".repeat(32)}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reconciliation: { checked: 0 }, deliveries: { processed: 0 } });
  });
});

const baseEnv = { PONT_PUBLIC_URL: "https://boutique.bj" };

describe("createPontFromEnv", () => {
  it("sandbox : paiement de bout en bout sans compte agrégateur", async () => {
    const pont = createPontFromEnv({ env: { ...baseEnv, PONT_SANDBOX: "true" } });
    const payment = await pont.createPayment(
      { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "order_1" },
      "idem-node-1",
    );
    expect((await pont.refreshPayment(payment.id)).status).toBe("succeeded");
  });

  it("refuse le sandbox en live, l'absence d'agrégateur, une configuration partielle", () => {
    expect(() => createPontFromEnv({ env: { ...baseEnv, PONT_SANDBOX: "true", PONT_MODE: "live" } })).toThrow(PontError);
    expect(() => createPontFromEnv({ env: baseEnv })).toThrow(PontError);
    expect(() => createPontFromEnv({ env: { ...baseEnv, FEDAPAY_SECRET_KEY: "sk" } })).toThrow(/FEDAPAY_WEBHOOK_SECRET/);
  });

  it("exige un stockage persistant en live", () => {
    expect(() => createPontFromEnv({ env: { ...baseEnv, PONT_MODE: "live", PAWAPAY_API_TOKEN: "t" } })).toThrow(/stockage persistant/);
  });

  it("CinetPay n'est activé que explicitement", () => {
    expect(() => createPontFromEnv({ env: { ...baseEnv, CINETPAY_API_KEY: "k", CINETPAY_SITE_ID: "1" } })).toThrow(/Aucun agrégateur/);
  });
});

describe("handleProviderRequest", () => {
  const env = { ...baseEnv, FEDAPAY_SECRET_KEY: "sk", FEDAPAY_WEBHOOK_SECRET: "wh_fp" };

  it("401 sur signature invalide, 404 sur agrégateur inconnu", async () => {
    const pont = createPontFromEnv({ env });
    const forged = () => new Request("https://boutique.bj/api/pont/hooks/fedapay", { method: "POST", body: "{}", headers: { "x-fedapay-signature": "t=1,s=abc" } });
    expect((await handleProviderRequest(pont, "fedapay", forged())).status).toBe(401);
    expect((await handleProviderRequest(pont, "stripe", forged())).status).toBe(404);
    expect((await handleProviderRequest(pont, "pawapay", forged())).status).toBe(404); // non configuré
  });

  it("200 sur un webhook valide pour une opération inconnue (rien à faire)", async () => {
    const pont = createPontFromEnv({ env });
    const body = JSON.stringify({ name: "transaction.approved", entity: { id: 1 } });
    const t = Math.floor(Date.now() / 1000);
    const request = new Request("https://boutique.bj/api/pont/hooks/fedapay", {
      method: "POST",
      body,
      headers: { "x-fedapay-signature": `t=${t},s=${hmacSha256Hex("wh_fp", `${t}.${body}`)}` },
    });
    const { POST } = createWebhookRoute(pont);
    const response = await POST(request, { params: Promise.resolve({ provider: "fedapay" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, status: "ignored" });
  });
});
