import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime.js";

const ADMIN = "b".repeat(32);
const API = "a".repeat(32);

async function rt() {
  return createRuntime({ PONT_MODE: "test", PONT_SANDBOX: "true", PONT_PUBLIC_URL: "https://pont.exemple.bj", PONT_API_KEY: API, PONT_ADMIN_TOKEN: ADMIN, PONT_WEBHOOK_URL: "https://app.exemple.bj/h", PONT_WEBHOOK_SECRET: "w".repeat(32) });
}
const admin = (r: Awaited<ReturnType<typeof rt>>, path: string) => r.handle(new Request(`http://pont.test/admin${path}`, { headers: { authorization: `Bearer ${ADMIN}` } }));
const create = (r: Awaited<ReturnType<typeof rt>>, reference: string, phone: string) =>
  r.handle(new Request("http://pont.test/v1/payments", { method: "POST", headers: { authorization: `Bearer ${API}` }, body: JSON.stringify({ amount: 5000, currency: "XOF", country: "BJ", customer: { phone }, reference }) }));

describe("API admin du dashboard", () => {
  it("l'aperçu indique le mode", async () => {
    const body = (await (await admin(await rt(), "/overview")).json()) as { mode: string };
    expect(body.mode).toBe("test");
  });

  it("détail d'un paiement : chronologie réelle avec la livraison du webhook", async () => {
    const r = await rt();
    const payment = (await (await create(r, "d1", "+2290100000001")).json()) as { id: string };
    const detail = (await (await admin(r, `/payments/${payment.id}`)).json()) as { payment: { id: string }; timeline: Array<{ kind: string; title: string }> };
    expect(detail.payment.id).toBe(payment.id);
    expect(detail.timeline[0]).toMatchObject({ kind: "created" });
    expect(detail.timeline.some((step) => step.kind === "webhook")).toBe(true);
    expect(detail.timeline.some((step) => step.kind === "status")).toBe(true);
  });

  it("paiement inconnu : 404", async () => {
    expect((await admin(await rt(), "/payments/pay_inconnu")).status).toBe(404);
  });

  it("couverture et santé par agrégateur, sans donnée inventée", async () => {
    const r = await rt();
    const coverage = (await (await admin(r, "/coverage")).json()) as { data: Array<{ country: string; deposit: string[] }> };
    expect(coverage.data.length).toBeGreaterThan(0);
    const before = (await (await admin(r, "/providers-health")).json()) as { data: Array<{ provider: string; lastHour: unknown }> };
    expect(before.data[0]?.lastHour).toBeNull();
    for (const [reference, phone] of [["h1", "+2290100000001"], ["h2", "+2290100000002"]] as const) {
      const { id } = (await (await create(r, reference, phone)).json()) as { id: string };
      await r.handle(new Request(`http://pont.test/v1/payments/${id}/refresh`, { method: "POST", headers: { authorization: `Bearer ${API}` } }));
    }
    const after = (await (await admin(r, "/providers-health")).json()) as { data: Array<{ lastHour: { settled: number; succeeded: number; rate: number } | null }> };
    expect(after.data[0]?.lastHour).toMatchObject({ settled: 2, succeeded: 1, rate: 0.5 });
  });
});
