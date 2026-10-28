import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FetchLike } from "@pont-bj/core";
import { createRuntime } from "../src/runtime.js";

const API_KEY = "a".repeat(32);
const ADMIN = "b".repeat(32);
const MASTER = "c".repeat(64);
const PLUGINS = fileURLToPath(new URL("./fixtures/plugins", import.meta.url));
const SECRET_KEY = "sk_mon_abcdef123456";
const WEBHOOK_SECRET = "whsec_mon_abcdef123456";

const base = {
  PONT_MODE: "test",
  PONT_PUBLIC_URL: "https://pont.exemple.bj",
  PONT_API_KEY: API_KEY,
  PONT_ADMIN_TOKEN: ADMIN,
  PONT_PLUGINS_DIR: PLUGINS,
};

/** Faux agrégateur : aucune requête ne sort de la machine. */
function fakeAggregator() {
  const state = { status: "WAITING", calls: [] as string[], auth: [] as string[], attemptRef: "" };
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    state.calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    state.auth.push(new Headers(init?.headers).get("authorization") ?? "");
    if ((init?.method ?? "GET") === "POST") {
      state.attemptRef = (JSON.parse(String(init?.body)) as { merchant_ref: string }).merchant_ref;
      return new Response(JSON.stringify({ data: { id: "mon_1" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: { id: "mon_1", status: state.status, amount: 5000, currency: "XOF", merchant_ref: state.attemptRef } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { state, fetchImpl };
}

async function runtime(extra: Record<string, string> = {}, fetchImpl?: FetchLike) {
  return createRuntime({ ...base, ...extra }, fetchImpl ? { pluginFetch: fetchImpl } : {});
}
type Rt = Awaited<ReturnType<typeof runtime>>;

const admin = (rt: Rt, path: string, method = "GET", body?: unknown) =>
  rt.handle(new Request(`http://pont.test/admin${path}`, { method, headers: { authorization: `Bearer ${ADMIN}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }));

const v1 = (rt: Rt, path: string, init: { method?: string; body?: unknown } = {}) =>
  rt.handle(
    new Request(`http://pont.test/v1${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
  );

const signedHook = (rt: Rt, body: string, secret = WEBHOOK_SECRET) =>
  rt.handle(
    new Request("http://pont.test/hooks/monagregateur", {
      method: "POST",
      headers: { "x-mon-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
      body,
    }),
  );

const order = (reference: string) => ({ amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290197000001" }, reference });

describe("agrégateurs personnalisés", () => {
  it("expose les champs du plugin (issus de spec.json), sans secret", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    const body = (await (await admin(rt, "/providers")).json()) as { data: Array<{ id: string; custom?: boolean; configured: boolean; webhookUrl: string; fields: Array<{ name: string; secret: boolean; set: boolean }> }>; pluginErrors: unknown[] };
    const plugin = body.data.find((p) => p.id === "monagregateur")!;
    expect(plugin).toMatchObject({ custom: true, configured: false, webhookUrl: "https://pont.exemple.bj/hooks/monagregateur" });
    expect(plugin.fields.map((f) => f.name)).toEqual(["secretKey", "webhookSecret"]);
    expect(plugin.fields.every((f) => f.secret && !f.set)).toBe(true);
    expect(body.pluginErrors).toEqual([]);
    // Les quatre intégrés restent présents.
    expect(body.data.filter((p) => !p.custom)).toHaveLength(4);
  });

  it("bout en bout : saisie des clés, paiement, webhook signé, statut final vérifié", async () => {
    const fake = fakeAggregator();
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER }, fake.fetchImpl);
    expect((await admin(rt, "/overview")).status).toBe(503);

    const saved = await admin(rt, "/providers/monagregateur", "PUT", { secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toContain(WEBHOOK_SECRET);
    expect(JSON.parse(text).data).toMatchObject({ id: "monagregateur", custom: true, configured: true, source: "vault" });

    // Hot-reload : le moteur sert déjà l'agrégateur personnalisé.
    const created = await v1(rt, "/payments", { method: "POST", body: order("cmd-1") });
    expect(created.status).toBe(201);
    const payment = (await created.json()) as { id: string; provider: string; status: string };
    expect(payment.provider).toBe("monagregateur");
    expect(payment.status).not.toBe("succeeded");
    expect(fake.state.auth[0]).toBe(`Bearer ${SECRET_KEY}`);

    // Signature invalide : refusée, rien ne change.
    const forged = JSON.stringify({ data: { id: "mon_1" } });
    expect((await signedHook(rt, forged, "mauvais-secret-mauvais-secret")).status).toBe(401);
    expect(((await (await v1(rt, `/payments/${payment.id}`)).json()) as { status: string }).status).not.toBe("succeeded");

    // Le webhook signé déclenche verify() chez l'agrégateur ; tant qu'il dit WAITING, pas de succès.
    expect((await signedHook(rt, forged)).status).toBe(200);
    expect(((await (await v1(rt, `/payments/${payment.id}`)).json()) as { status: string }).status).not.toBe("succeeded");

    // Il confirme (PAID) : c'est verify() qui fait passer le paiement à succeeded.
    fake.state.status = "PAID";
    expect((await signedHook(rt, forged)).status).toBe(200);
    expect(((await (await v1(rt, `/payments/${payment.id}`)).json()) as { status: string }).status).toBe("succeeded");
    expect(fake.state.calls.some((call) => call.startsWith("GET /v1/payments/mon_1") || call.includes("/payments/mon_1"))).toBe(true);
  });

  it("refuse une saisie incomplète ou inconnue, sans rien écrire", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    const partial = await admin(rt, "/providers/monagregateur", "PUT", { secretKey: SECRET_KEY });
    expect(partial.status).toBe(422);
    expect(JSON.stringify(await partial.json())).toContain("webhookSecret");
    expect((await admin(rt, "/providers/monagregateur", "PUT", { nimporte: "x" })).status).toBe(400);
    const list = (await (await admin(rt, "/providers")).json()) as { data: Array<{ id: string; source: string }> };
    expect(list.data.find((p) => p.id === "monagregateur")?.source).toBe("none");
  });

  it("applique la règle Kkiapay (CGU Art. 18) aussi avec un agrégateur personnalisé", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    await admin(rt, "/providers/monagregateur", "PUT", { secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
    const kkia = await admin(rt, "/providers/kkiapay", "PUT", { publicKey: "pub", privateKey: "priv_aaaaaaaa", secretKey: "sec_aaaaaaaa", webhookSecret: "wh_aaaaaaaa" });
    expect(kkia.status).toBe(422);
    expect(JSON.stringify(await kkia.json())).toContain("Kkiapay");
    expect((await admin(rt, "/overview")).status).toBe(200);
  });

  it("retire les clés : l'API repasse en 503 sans autre agrégateur", async () => {
    const rt = await runtime({ PONT_ENCRYPTION_KEY: MASTER });
    await admin(rt, "/providers/monagregateur", "PUT", { secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
    expect((await admin(rt, "/overview")).status).toBe(200);
    expect((await admin(rt, "/providers/monagregateur", "DELETE")).status).toBe(200);
    expect((await admin(rt, "/overview")).status).toBe(503);
  });

  it("fonctionne sans coffre, avec les variables d'environnement du plugin", async () => {
    const rt = await runtime({ MONAGREGATEUR_SECRET_KEY: SECRET_KEY, MONAGREGATEUR_WEBHOOK_SECRET: WEBHOOK_SECRET });
    const list = (await (await admin(rt, "/providers")).json()) as { vault: boolean; data: Array<{ id: string; source: string; configured: boolean }> };
    expect(list.vault).toBe(false);
    expect(list.data.find((p) => p.id === "monagregateur")).toMatchObject({ source: "env", configured: true });
    expect((await signedHook(rt, JSON.stringify({ data: { id: "inconnu" } }))).status).toBe(200);
  });

  it("répond 404 pour un agrégateur non enregistré et 401 sans bonne signature", async () => {
    const rt = await runtime({ MONAGREGATEUR_SECRET_KEY: SECRET_KEY, MONAGREGATEUR_WEBHOOK_SECRET: WEBHOOK_SECRET });
    expect((await rt.handle(new Request("http://pont.test/hooks/inconnu", { method: "POST", body: "{}" }))).status).toBe(404);
    expect((await rt.handle(new Request("http://pont.test/hooks/monagregateur", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("signale un plugin défaillant sans empêcher le démarrage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pont-plugins-"));
    mkdirSync(join(dir, "sans-spec"));
    mkdirSync(join(dir, "intégré"));
    writeFileSync(join(dir, "intégré", "spec.json"), JSON.stringify({ id: "fedapay", label: "Faux", keys: ["secretKey"] }));
    mkdirSync(join(dir, "sans-entree"));
    writeFileSync(join(dir, "sans-entree", "spec.json"), JSON.stringify({ id: "autre", label: "Autre", keys: ["secretKey"] }));
    const rt = await runtime({ PONT_PLUGINS_DIR: dir, PONT_SANDBOX: "true" });
    const list = (await (await admin(rt, "/providers")).json()) as { pluginErrors: Array<{ dir: string; message: string }>; data: Array<{ custom?: boolean }> };
    expect(list.pluginErrors.map((e) => e.dir).sort()).toEqual(["intégré", "sans-entree", "sans-spec"]);
    expect(list.pluginErrors.find((e) => e.dir === "intégré")?.message).toMatch(/intégré/);
    expect(list.data.some((p) => p.custom)).toBe(false);
  });

  it("dossier des plugins introuvable : erreur signalée, serveur démarré", async () => {
    const rt = await runtime({ PONT_PLUGINS_DIR: "/chemin/inexistant", PONT_SANDBOX: "true" });
    const list = (await (await admin(rt, "/providers")).json()) as { pluginErrors: unknown[] };
    expect(list.pluginErrors).toHaveLength(1);
  });
});
