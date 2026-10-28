import { describe, expect, it } from "vitest";
import { MemorySecretStore } from "@pont/engine";
import { createRuntime } from "../src/runtime.js";
import { memoryStorage } from "../src/storage.js";
import { Vault } from "../src/vault.js";

const API_KEY = "a".repeat(32);
const ADMIN = "b".repeat(32);
const MASTER = "c".repeat(64);

const base = {
  PONT_MODE: "test",
  PONT_PUBLIC_URL: "https://pont.exemple.bj",
  PONT_API_KEY: API_KEY,
  PONT_ADMIN_TOKEN: ADMIN,
};

async function runtime(extra: Record<string, string> = {}) {
  return createRuntime({ ...base, ...extra });
}

type Rt = Awaited<ReturnType<typeof runtime>>;

const admin = (rt: Rt, path: string, method = "GET", body?: unknown) =>
  rt.handle(
    new Request(`http://pont.test/admin${path}`, {
      method,
      headers: { authorization: `Bearer ${ADMIN}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

const payment = (reference: string) =>
  new Request("http://pont.test/v1/payments", {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference }),
  });

describe("coffre", () => {
  it("chiffre et déchiffre, lié à la clé de stockage", async () => {
    const store = new MemorySecretStore();
    const vault = new Vault(store, MASTER);
    await vault.putJson("provider:fedapay", { secretKey: "sk_live_très_secret" });
    expect(await store.get("provider:fedapay")).not.toContain("très_secret");
    expect(await vault.getJson("provider:fedapay")).toEqual({ secretKey: "sk_live_très_secret" });
    await store.put("provider:autre", (await store.get("provider:fedapay"))!);
    await expect(vault.getJson("provider:autre")).rejects.toThrow(/déchiffrer/);
    expect(() => new Vault(store, "court")).toThrow(/64/);
  });

  it("refuse de déchiffrer avec une autre clé maître", async () => {
    const store = new MemorySecretStore();
    await new Vault(store, MASTER).putJson("provider:fedapay", { a: "b" });
    await expect(new Vault(store, "d".repeat(64)).getJson("provider:fedapay")).rejects.toMatchObject({ fix: expect.stringContaining("PONT_ENCRYPTION_KEY") });
  });
});

describe("clés des agrégateurs", () => {
  it("démarre sans agrégateur avec le coffre, répond 503, puis s'active après saisie des clés", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    expect((await rt.handle(payment("c1"))).status).toBe(503);
    expect((await admin(rt, "/overview")).status).toBe(503);

    const before = (await (await admin(rt, "/providers")).json()) as { vault: boolean; data: Array<{ id: string; configured: boolean }> };
    expect(before.vault).toBe(true);
    expect(before.data.every((p) => !p.configured)).toBe(true);

    const saved = await admin(rt, "/providers/fedapay", "PUT", { secretKey: "sk_sandbox_abcdef123456", webhookSecret: "whsec_abcdef123456" });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain("sk_sandbox_abcdef123456");
    expect(text).toContain("••••3456");
    expect(JSON.parse(text).data).toMatchObject({ source: "vault", configured: true, webhookUrl: "https://pont.exemple.bj/hooks/fedapay" });

    // Le moteur est reconstruit : l'API sort du 503 (sans créer de paiement, pour ne contacter aucun agrégateur).
    expect((await admin(rt, "/overview")).status).toBe(200);
  });

  it("fusionne : un champ omis garde sa valeur", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    await admin(rt, "/providers/paydunya", "PUT", { masterKey: "mk_aaaaaaaaaaaa", privateKey: "pk_aaaaaaaaaaaa", token: "tk_aaaaaaaaaaaa", storeName: "Boutique" });
    const response = await admin(rt, "/providers/paydunya", "PUT", { storeName: "Autre boutique" });
    const view = ((await response.json()) as { data: { fields: Array<{ name: string; value: string | null }> } }).data;
    expect(view.fields.find((f) => f.name === "storeName")?.value).toBe("Autre boutique");
    expect(view.fields.find((f) => f.name === "masterKey")?.value).toBe("••••aaaa");
  });

  it("refuse une saisie incomplète, un champ inconnu et Kkiapay avec un autre agrégateur", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    expect((await admin(rt, "/providers/fedapay", "PUT", { secretKey: "sk_seul_sans_secret" })).status).toBe(422);
    expect((await admin(rt, "/providers/fedapay", "PUT", { nimporte: "x" })).status).toBe(400);
    await admin(rt, "/providers/fedapay", "PUT", { secretKey: "sk_sandbox_abcdef123456", webhookSecret: "whsec_abcdef123456" });
    const kkia = await admin(rt, "/providers/kkiapay", "PUT", { publicKey: "pub", privateKey: "priv_aaaaaaaa", secretKey: "sec_aaaaaaaa", webhookSecret: "wh_aaaaaaaa" });
    expect(kkia.status).toBe(422);
    expect(JSON.stringify(await kkia.json())).toContain("Kkiapay");
    // Rien n'a été écrit : Kkiapay reste non configuré et FedaPay actif.
    const after = (await (await admin(rt, "/providers")).json()) as { data: Array<{ id: string; source: string }> };
    expect(after.data.find((p) => p.id === "kkiapay")?.source).toBe("none");
    expect(after.data.find((p) => p.id === "fedapay")?.source).toBe("vault");
    expect((await admin(rt, "/overview")).status).toBe(200);
  });

  it("supprime un agrégateur et repasse en 503", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    await admin(rt, "/providers/fedapay", "PUT", { secretKey: "sk_sandbox_abcdef123456", webhookSecret: "whsec_abcdef123456" });
    expect((await admin(rt, "/providers/fedapay", "DELETE")).status).toBe(200);
    expect((await admin(rt, "/overview")).status).toBe(503);
  });

  it("sans clé maître : lecture seule, saisie refusée (409)", async () => {
    const rt = await runtime({ PONT_SANDBOX: "true" });
    expect(((await (await admin(rt, "/providers")).json()) as { vault: boolean }).vault).toBe(false);
    expect((await admin(rt, "/providers/fedapay", "PUT", { secretKey: "x" })).status).toBe(409);
  });

  it("exige le jeton admin", async () => {
    const rt = await runtime({ PONT_SANDBOX: "true" });
    expect((await rt.handle(new Request("http://pont.test/admin/providers"))).status).toBe(401);
  });

  it("démarre sans coffre ni agrégateur : refus clair", async () => {
    await expect(runtime()).rejects.toThrow(/agrégateur/);
  });

  it("garde les clés après redémarrage (même stockage)", async () => {
    const storage = await memoryStorage({} as never);
    const env = { ...base, PONT_ENCRYPTION_KEY: MASTER };
    const first = await createRuntime(env, { storage: () => storage });
    await admin(first, "/providers/fedapay", "PUT", { secretKey: "sk_sandbox_abcdef123456", webhookSecret: "whsec_abcdef123456" });
    const second = await createRuntime(env, { storage: () => storage });
    expect((await admin(second, "/overview")).status).toBe(200);
  });
});

describe("destinataires de webhooks", () => {
  it("crée un destinataire (secret montré une fois), le liste, puis le retire", async () => {
    const rt = await runtime({ PONT_SANDBOX: "true", PONT_ENCRYPTION_KEY: MASTER });
    const created = await admin(rt, "/webhooks/endpoints", "POST", { url: "https://app.exemple.bj/pont" });
    expect(created.status).toBe(201);
    const { id, secret } = (await created.json()) as { id: string; secret: string };
    expect(secret).toMatch(/^whsec_/);

    const listed = await (await admin(rt, "/webhooks")).text();
    expect(listed).not.toContain(secret);
    expect(JSON.parse(listed).endpoints).toEqual([expect.objectContaining({ id, url: "https://app.exemple.bj/pont", source: "vault" })]);

    expect((await admin(rt, `/webhooks/endpoints/${id}`, "DELETE")).status).toBe(200);
    expect(JSON.parse(await (await admin(rt, "/webhooks")).text()).endpoints).toEqual([]);
  });

  it("refuse une adresse interne", async () => {
    // L'interdiction des adresses internes ne s'applique qu'en live.
    const storage = { ...(await memoryStorage({} as never)), durable: true };
    const rt = await createRuntime(
      { ...base, PONT_MODE: "live", PONT_ENCRYPTION_KEY: MASTER, FEDAPAY_SECRET_KEY: "sk_live_aaaaaaaaaaaa", FEDAPAY_WEBHOOK_SECRET: "whsec_aaaaaaaaaaaa" },
      { storage: () => storage },
    );
    expect((await admin(rt, "/webhooks/endpoints", "POST", { url: "http://localhost:3000/x" })).status).toBe(400);
    expect(JSON.parse(await (await admin(rt, "/webhooks")).text()).endpoints).toEqual([]);
  });

  it("met en file les événements pour le destinataire et expose l'historique", async () => {
    const rt = await runtime({ PONT_SANDBOX: "true", PONT_ENCRYPTION_KEY: MASTER });
    await admin(rt, "/webhooks/endpoints", "POST", { url: "https://app.exemple.bj/pont" });
    await rt.handle(payment("w1"));
    const body = JSON.parse(await (await admin(rt, "/webhooks")).text()) as { deliveries: Array<{ eventType: string | null; status: string; url: string }>; inbound: unknown[] };
    expect(body.deliveries.length).toBeGreaterThan(0);
    expect(body.deliveries[0]).toMatchObject({ url: "https://app.exemple.bj/pont", status: "pending" });
    expect(body.deliveries[0]?.eventType).toMatch(/^payment\./);
    expect(body.inbound).toHaveLength(4);
  });
});
