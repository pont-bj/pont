import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime.js";
import type { Mail, TransportFactory } from "../src/email.js";

const API_KEY = "a".repeat(32);
const ADMIN = "b".repeat(32);
const MASTER = "c".repeat(64);

const base = { PONT_MODE: "test", PONT_SANDBOX: "true", PONT_PUBLIC_URL: "https://pont.exemple.bj", PONT_API_KEY: API_KEY, PONT_ADMIN_TOKEN: ADMIN, PONT_ENCRYPTION_KEY: MASTER };

function setup(options: { fail?: boolean } = {}) {
  const sent: Array<Mail & { from: string }> = [];
  const transport: TransportFactory = () => ({
    sendMail: async (mail) => {
      if (options.fail) throw new Error("535 Authentication failed for user secret-user");
      sent.push(mail);
    },
  });
  return { sent, runtime: createRuntime(base, { transport }) };
}

type Rt = Awaited<ReturnType<typeof createRuntime>>;

const admin = (rt: Rt, path: string, method = "GET", body?: unknown) =>
  rt.handle(
    new Request(`http://pont.test/admin${path}`, {
      method,
      headers: { authorization: `Bearer ${ADMIN}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

const smtp = { host: "smtp.exemple.bj", port: 587, security: "starttls", user: "contact@exemple.bj", password: "mot-de-passe-smtp-secret", from: "Pont <contact@exemple.bj>" };

async function failedPayment(rt: Rt, reference: string) {
  const response = await rt.handle(
    new Request("http://pont.test/v1/payments", {
      method: "POST",
      headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000008" }, reference }),
    }),
  );
  const { id } = (await response.json()) as { id: string };
  await rt.handle(new Request(`http://pont.test/v1/payments/${id}/refresh`, { method: "POST", headers: { authorization: `Bearer ${API_KEY}` } }));
  return id;
}

describe("configuration SMTP", () => {
  it("enregistre sans jamais relire le mot de passe, et le garde si omis", async () => {
    const { runtime } = setup();
    const rt = await runtime;
    expect(await (await admin(rt, "/email")).json()).toMatchObject({ vault: true, configured: false });
    const saved = await (await admin(rt, "/email", "PUT", smtp)).text();
    expect(saved).not.toContain("mot-de-passe-smtp-secret");
    expect(JSON.parse(saved)).toMatchObject({ configured: true, host: "smtp.exemple.bj", passwordSet: true });
    const { password: _omitted, ...withoutPassword } = smtp;
    await admin(rt, "/email", "PUT", { ...withoutPassword, port: 465, security: "tls" });
    expect(JSON.parse(await (await admin(rt, "/email")).text())).toMatchObject({ port: 465, security: "tls", passwordSet: true });
  });

  it("refuse une configuration invalide (400)", async () => {
    const rt = await setup().runtime;
    expect((await admin(rt, "/email", "PUT", { host: "", port: 99999, security: "ssl", from: "x" })).status).toBe(400);
  });

  it("envoie l'e-mail de test et la route d'envoi du dashboard, avec l'expéditeur configuré", async () => {
    const { sent, runtime } = setup();
    const rt = await runtime;
    await admin(rt, "/email", "PUT", smtp);
    expect((await admin(rt, "/email/test", "POST", { to: "moi@exemple.bj" })).status).toBe(200);
    expect((await admin(rt, "/email/send", "POST", { to: "moi@exemple.bj", subject: "Réinitialisation", text: "Lien : https://x" })).status).toBe(200);
    expect(sent.map((m) => m.subject)).toEqual(["Pont : e-mail de test", "Réinitialisation"]);
    expect(sent[0]).toMatchObject({ from: "Pont <contact@exemple.bj>", to: "moi@exemple.bj" });
    expect((await admin(rt, "/email/send", "POST", { to: "pas-une-adresse", subject: "a", text: "b" })).status).toBe(400);
  });

  it("sans SMTP : 409 clair ; sans coffre : 409 vault_disabled", async () => {
    const rt = await setup().runtime;
    const response = await admin(rt, "/email/send", "POST", { to: "moi@exemple.bj", subject: "a", text: "b" });
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("smtp_not_configured");
    const sansCoffre = await createRuntime({ ...base, PONT_ENCRYPTION_KEY: "" });
    expect((await admin(sansCoffre, "/email", "PUT", smtp)).status).toBe(409);
  });

  it("échec SMTP : 502, sans fuite du mot de passe", async () => {
    const rt = await setup({ fail: true }).runtime;
    await admin(rt, "/email", "PUT", smtp);
    const response = await admin(rt, "/email/test", "POST", { to: "moi@exemple.bj" });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("mot-de-passe-smtp-secret");
  });
});

describe("alertes", () => {
  it("par défaut : toutes les règles désactivées, aucun e-mail", async () => {
    const { sent, runtime } = setup();
    const rt = await runtime;
    const view = (await (await admin(rt, "/alerts")).json()) as { rules: Array<{ id: string; enabled: boolean }>; emailConfigured: boolean };
    expect(view.rules.length).toBe(5);
    expect(view.rules.every((rule) => !rule.enabled)).toBe(true);
    expect(view.emailConfigured).toBe(false);
    await failedPayment(rt, "a0");
    await rt.tick();
    expect(sent).toHaveLength(0);
  });

  it("un paiement échoué déclenche un seul e-mail, jamais deux pour le même", async () => {
    const { sent, runtime } = setup();
    const rt = await runtime;
    await admin(rt, "/email", "PUT", smtp);
    await admin(rt, "/alerts", "PUT", { rules: { payment_failed: true }, recipients: ["moi@exemple.bj", "equipe@exemple.bj"] });
    const id = await failedPayment(rt, "a1");
    await rt.tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ["moi@exemple.bj", "equipe@exemple.bj"], subject: "Pont : Paiement échoué" });
    expect(sent[0]!.text).toContain(id);
    await rt.tick();
    await rt.tick();
    expect(sent).toHaveLength(1);
    const history = ((await (await admin(rt, "/alerts")).json()) as { history: Array<{ status: string; rule: string }> }).history;
    expect(history).toEqual([expect.objectContaining({ status: "sent", rule: "payment_failed" })]);
    // Un second paiement échoué : nouvelle alerte, l'ancienne n'est pas renvoyée.
    await failedPayment(rt, "a2");
    await rt.tick();
    expect(sent).toHaveLength(2);
  });

  it("sans SMTP ni destinataire, rien n'est perdu : l'alerte part dès que tout est configuré", async () => {
    const { sent, runtime } = setup();
    const rt = await runtime;
    await admin(rt, "/alerts", "PUT", { rules: { payment_failed: true }, recipients: ["moi@exemple.bj"] });
    await failedPayment(rt, "a3");
    await rt.tick();
    expect(sent).toHaveLength(0);
    await admin(rt, "/email", "PUT", smtp);
    await rt.tick();
    expect(sent).toHaveLength(1);
  });

  it("échec d'envoi : consigné « failed » dans l'historique, la boucle continue", async () => {
    const { runtime } = setup({ fail: true });
    const rt = await runtime;
    await admin(rt, "/email", "PUT", smtp);
    await admin(rt, "/alerts", "PUT", { rules: { payment_failed: true }, recipients: ["moi@exemple.bj"] });
    await failedPayment(rt, "a4");
    await rt.tick();
    const history = ((await (await admin(rt, "/alerts")).json()) as { history: Array<{ status: string; error?: string }> }).history;
    expect(history[0]).toMatchObject({ status: "failed" });
    expect(JSON.stringify(history)).not.toContain("mot-de-passe-smtp-secret");
  });

  it("connexion administrateur : seulement si la règle est active ; évènement inconnu refusé", async () => {
    const { sent, runtime } = setup();
    const rt = await runtime;
    await admin(rt, "/email", "PUT", smtp);
    await admin(rt, "/alerts", "PUT", { rules: {}, recipients: ["moi@exemple.bj"] });
    await admin(rt, "/alerts/events", "POST", { rule: "admin_login", detail: "admin@exemple.bj" });
    expect(sent).toHaveLength(0);
    await admin(rt, "/alerts", "PUT", { rules: { admin_login: true }, recipients: ["moi@exemple.bj"] });
    await admin(rt, "/alerts/events", "POST", { rule: "admin_login", detail: "admin@exemple.bj" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("admin@exemple.bj");
    expect((await admin(rt, "/alerts/events", "POST", { rule: "payment_failed" })).status).toBe(400);
  });

  it("refuse une règle inconnue ou un destinataire invalide (400) ; l'alerte de test part", async () => {
    const { sent, runtime } = setup();
    const rt = await runtime;
    expect((await admin(rt, "/alerts", "PUT", { rules: { inconnue: true }, recipients: [] })).status).toBe(400);
    expect((await admin(rt, "/alerts", "PUT", { rules: {}, recipients: ["pas-un-mail"] })).status).toBe(400);
    expect((await admin(rt, "/alerts/test", "POST")).status).toBe(409);
    await admin(rt, "/email", "PUT", smtp);
    await admin(rt, "/alerts", "PUT", { rules: {}, recipients: ["moi@exemple.bj"] });
    expect((await admin(rt, "/alerts/test", "POST")).status).toBe(200);
    expect(sent[0]!.subject).toBe("Pont : Alerte de test");
  });
});
