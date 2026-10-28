import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime.js";
import { parseServerEnv } from "../src/config.js";

const API_KEY = "a".repeat(32);
const ADMIN = "b".repeat(32);

async function runtime(extra: Record<string, string> = {}) {
  return createRuntime({
    PONT_MODE: "test",
    PONT_SANDBOX: "true",
    PONT_PUBLIC_URL: "https://pont.exemple.bj",
    PONT_API_KEY: API_KEY,
    PONT_ADMIN_TOKEN: ADMIN,
    ...extra,
  });
}

const payment = (reference: string, phone = "+2290100000001") => ({
  amount: 5000,
  currency: "XOF",
  country: "BJ",
  customer: { phone },
  reference,
});

const call = (rt: Awaited<ReturnType<typeof runtime>>, path: string, init: RequestInit & { token?: string; idem?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.idem) headers.set("idempotency-key", init.idem);
  if (init.body) headers.set("content-type", "application/json");
  return rt.handle(new Request(`http://pont.test${path}`, { ...init, headers }));
};

describe("serveur Pont", () => {
  it("répond sur /health sans authentification", async () => {
    const response = await call(await runtime(), "/health");
    expect(response.status).toBe(200);
  });

  it("refuse /v1 sans clé ou avec une mauvaise clé", async () => {
    const rt = await runtime();
    expect((await call(rt, "/v1/payments/x")).status).toBe(401);
    expect((await call(rt, "/v1/payments/x", { token: "c".repeat(32) })).status).toBe(401);
  });

  it("n'accepte pas le jeton admin sur /v1 ni la clé API sur /admin", async () => {
    const rt = await runtime();
    expect((await call(rt, "/v1/payments/x", { token: ADMIN })).status).toBe(401);
    expect((await call(rt, "/admin/overview", { token: API_KEY })).status).toBe(401);
  });

  it("crée un paiement sandbox, le lit puis le vérifie", async () => {
    const rt = await runtime();
    const created = await call(rt, "/v1/payments", { method: "POST", token: API_KEY, idem: "idem-12345678", body: JSON.stringify(payment("cmd-1")) });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };
    const refreshed = await call(rt, `/v1/payments/${body.id}/refresh`, { method: "POST", token: API_KEY });
    expect(((await refreshed.json()) as { status: string }).status).toBe("succeeded");
    const read = await call(rt, `/v1/payments/${body.id}`, { token: API_KEY });
    expect(((await read.json()) as { status: string }).status).toBe("succeeded");
  });

  it("déduit la clé d'idempotence de la référence quand l'en-tête manque", async () => {
    const rt = await runtime();
    const init = { method: "POST", token: API_KEY, body: JSON.stringify(payment("cmd-2")) };
    const first = (await (await call(rt, "/v1/payments", init)).json()) as { id: string };
    const second = (await (await call(rt, "/v1/payments", init)).json()) as { id: string };
    expect(second.id).toBe(first.id);
    const autre = (await (await call(rt, "/v1/payments", { ...init, body: JSON.stringify(payment("cmd-2b")) })).json()) as { id: string };
    expect(autre.id).not.toBe(first.id);
  });

  it("refuse la même référence avec un contenu différent", async () => {
    const rt = await runtime();
    await call(rt, "/v1/payments", { method: "POST", token: API_KEY, body: JSON.stringify(payment("cmd-4")) });
    const conflit = await call(rt, "/v1/payments", { method: "POST", token: API_KEY, body: JSON.stringify({ ...payment("cmd-4"), amount: 9999 }) });
    expect(conflit.status).toBe(409);
  });

  it("l'en-tête Idempotency-Key explicite l'emporte et rejoue la même réponse", async () => {
    const rt = await runtime();
    const init = { method: "POST", token: API_KEY, idem: "idem-abcdefgh", body: JSON.stringify(payment("cmd-3")) };
    const first = (await (await call(rt, "/v1/payments", init)).json()) as { id: string };
    const second = (await (await call(rt, "/v1/payments", init)).json()) as { id: string };
    expect(second.id).toBe(first.id);
  });

  it("répond 400 sans référence ni en-tête", async () => {
    const rt = await runtime();
    const { reference: _reference, ...sansReference } = payment("x");
    expect((await call(rt, "/v1/payments", { method: "POST", token: API_KEY, body: JSON.stringify(sansReference) })).status).toBe(400);
  });

  it("renvoie 400 sur un corps invalide et 404 sur un paiement inconnu", async () => {
    const rt = await runtime();
    const invalid = await call(rt, "/v1/payments", { method: "POST", token: API_KEY, idem: "idem-invalide1", body: JSON.stringify({ amount: -1 }) });
    expect(invalid.status).toBe(400);
    expect((await call(rt, "/v1/payments/inconnu", { token: API_KEY })).status).toBe(404);
  });

  it("alimente le dashboard : aperçu et paiement de test", async () => {
    const rt = await runtime();
    const test = await call(rt, "/admin/test-payment", { method: "POST", token: ADMIN, body: JSON.stringify({}) });
    expect(test.status).toBe(201);
    expect(((await test.json()) as { status: string }).status).toBe("succeeded");
    const overview = (await (await call(rt, "/admin/overview", { token: ADMIN })).json()) as { payments: { count: number; succeeded: number; volume: number } };
    expect(overview.payments).toMatchObject({ count: 1, succeeded: 1, volume: 5000 });
    const list = (await (await call(rt, "/admin/payments", { token: ADMIN })).json()) as { data: unknown[] };
    expect(list.data).toHaveLength(1);
  });

  it("simule un échec avec un numéro magique", async () => {
    const rt = await runtime();
    const test = await call(rt, "/admin/test-payment", { method: "POST", token: ADMIN, body: JSON.stringify({ scenario: "0000002" }) });
    expect(((await test.json()) as { status: string }).status).toBe("failed");
  });

  it("refuse le paiement de test hors sandbox", async () => {
    const rt = await runtime({ PONT_SANDBOX: "false", FEDAPAY_SECRET_KEY: "sk_sandbox_x", FEDAPAY_WEBHOOK_SECRET: "wh_x" });
    expect((await call(rt, "/admin/test-payment", { method: "POST", token: ADMIN, body: "{}" })).status).toBe(403);
  });

  it("rejette un webhook d'agrégateur inconnu", async () => {
    expect((await call(await runtime(), "/hooks/inconnu", { method: "POST", body: "{}" })).status).toBe(404);
  });
});

describe("configuration", () => {
  it("refuse des secrets trop courts", () => {
    expect(() => parseServerEnv({ PONT_API_KEY: "court", PONT_ADMIN_TOKEN: ADMIN })).toThrow(/32 caractères/);
  });

  it("exige l'URL et le secret Convex ensemble avec PONT_STORE=convex", () => {
    expect(() => parseServerEnv({ PONT_API_KEY: API_KEY, PONT_ADMIN_TOKEN: ADMIN, PONT_STORE: "convex" })).toThrow(/CONVEX_URL/);
  });

  it("traite les variables vides comme absentes (Docker Compose)", () => {
    const env = parseServerEnv({ PONT_API_KEY: API_KEY, PONT_ADMIN_TOKEN: ADMIN, PONT_WEBHOOK_URL: "", PONT_WEBHOOK_SECRET: "", CONVEX_URL: "" });
    expect(env.PONT_WEBHOOK_URL).toBeUndefined();
  });

  it("refuse le live avec le stockage en mémoire", async () => {
    await expect(runtime({ PONT_MODE: "live", PONT_SANDBOX: "false", FEDAPAY_SECRET_KEY: "sk_live_x", FEDAPAY_WEBHOOK_SECRET: "wh_x" })).rejects.toThrow(/stockage durable/);
  });
});
