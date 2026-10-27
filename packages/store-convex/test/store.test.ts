import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PontEngine, WebhookRelay } from "@pont/engine";
import { SandboxAdapter } from "@pont/sandbox";
import schema from "../convex/schema";
import { createConvexStores, type ConvexRunner } from "../src/index";

const modules = import.meta.glob("../convex/**/*.ts");
const SECRET = "s".repeat(40);

function setup() {
  const t = convexTest(schema, modules);
  const client = t as unknown as ConvexRunner;
  return { t, stores: createConvexStores({ client, secret: SECRET }) };
}

beforeEach(() => {
  vi.stubEnv("PONT_STORE_SECRET", SECRET);
});

describe("stores Convex", () => {
  it("refuse un mauvais secret et un secret trop court", async () => {
    const { t } = setup();
    const wrong = createConvexStores({ client: t as unknown as ConvexRunner, secret: "x".repeat(40) });
    await expect(wrong.payments.get("pay_1")).rejects.toThrow(/Accès refusé/);
    expect(() => createConvexStores({ client: t as unknown as ConvexRunner, secret: "court" })).toThrow();
  });

  it("idempotence : une seule réservation par clé", async () => {
    const { stores } = setup();
    expect(await stores.idempotency.putIfAbsent("payment:k1", { fingerprint: "f", recordId: "pay_1" })).toBe(true);
    expect(await stores.idempotency.putIfAbsent("payment:k1", { fingerprint: "g", recordId: "pay_2" })).toBe(false);
    expect(await stores.idempotency.get("payment:k1")).toEqual({ fingerprint: "f", recordId: "pay_1" });
  });

  it("conserve les métadonnées libres du marchand (clés commençant par _ ou $)", async () => {
    const { stores } = setup();
    const { engine } = engineWith(stores);
    const payment = await engine.createPayment(
      { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "o1", metadata: { _interne: "a", $prix: "b" } },
      "idem-meta",
    );
    expect((await stores.payments.get(payment.id))?.metadata).toEqual({ _interne: "a", $prix: "b" });
  });
});

function engineWith(stores: ReturnType<typeof createConvexStores>, now = () => Date.now()) {
  return {
    engine: new PontEngine({
      adapters: [new SandboxAdapter({ now })],
      paymentStore: stores.payments,
      payoutStore: stores.payouts,
      refundStore: stores.refunds,
      idempotencyStore: stores.idempotency,
      callbackUrl: () => "https://boutique.bj/hooks",
      now,
    }),
  };
}

describe("moteur sur Convex", () => {
  it("paiement complet, idempotence, recherche par tentative", async () => {
    const { stores } = setup();
    const { engine } = engineWith(stores);
    const input = { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "o2" };
    const created = await engine.createPayment(input, "idem-convex-1");
    expect((await engine.createPayment(input, "idem-convex-1")).id).toBe(created.id);
    expect((await stores.payments.findByAttempt("sandbox", created.attemptId))?.id).toBe(created.id);
    expect((await engine.refreshPayment(created.id)).status).toBe("succeeded");
  });

  it("réconciliation : relit le paiement ambigu et le règle", async () => {
    let now = 1_000_000;
    const { stores } = setup();
    const { engine } = engineWith(stores, () => now);
    const ambiguous = await engine.createPayment(
      { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000007" }, reference: "o3" },
      "idem-convex-2",
    );
    expect(ambiguous.needsReconciliation).toBe(true);
    expect(await engine.reconcile({ minAgeMs: 60_000 })).toEqual({ checked: 0, changed: 0, errors: 0 }); // trop récent
    now += 120_000;
    expect(await engine.reconcile({ minAgeMs: 60_000 })).toEqual({ checked: 1, changed: 1, errors: 0 });
    expect(await stores.payments.get(ambiguous.id)).toMatchObject({ status: "succeeded", needsReconciliation: false });
    expect(await stores.payments.listUnsettled(now, 10)).toHaveLength(0);
  });

  it("relais : les livraisons dues sont persistées et reprises", async () => {
    let now = 0;
    const { stores } = setup();
    const relay = new WebhookRelay({
      mode: "live",
      endpoints: [{ id: "we_1", url: "https://boutique.bj/webhook", secret: "whsec" }],
      store: stores.deliveries,
      now: () => now,
      scheduleSeconds: [0, 60],
      fetch: async () => new Response("down", { status: 503 }),
    });
    const { engine } = engineWith(stores, () => now);
    const payment = await engine.createPayment(
      { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "o4" },
      "idem-convex-3",
    );
    const [delivery] = await relay.enqueue({ id: "evt_1", type: "payment.pending", createdAt: now, object: "payment", data: payment });
    await relay.processDue();
    expect(await stores.deliveries.get(delivery!.id)).toMatchObject({ status: "pending", nextAttemptAt: 60_000 });
    now = 60_000;
    await relay.processDue();
    expect((await stores.deliveries.get(delivery!.id))?.status).toBe("failed");
  });
});
