import { describe, expect, it } from "vitest";
import { PontError, verifyPontWebhook } from "@pont-bj/core";
import {
  MemoryDeliveryStore,
  MemoryIdempotencyStore,
  MemoryPaymentStore,
  PontEngine,
  WebhookRelay,
  assertDeliverableUrl,
  type PontEvent,
} from "../src/index.js";
import { FakeAdapter, baseInput } from "./helpers.js";

function setup(adapter = new FakeAdapter("pawapay")) {
  const events: PontEvent[] = [];
  const engine = new PontEngine({
    adapters: [adapter],
    paymentStore: new MemoryPaymentStore(),
    idempotencyStore: new MemoryIdempotencyStore(),
    callbackUrl: () => "https://marchand.bj/hooks",
    onEvent: (event) => {
      events.push(event);
    },
  });
  return { engine, events, adapter };
}

async function expectPontError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(PontError);
    expect((error as PontError).code).toBe(code);
  }
}

const payoutInput = {
  amount: 2000,
  currency: "XOF",
  country: "BJ",
  operator: "mtn_bj",
  recipient: { phone: "0197000001", name: "Koffi" },
  reference: "salaire_oct",
} as const;

async function succeededPayment(engine: PontEngine, key = "idem-paid") {
  const payment = await engine.createPayment(baseInput, key);
  return engine.refreshPayment(payment.id);
}

describe("retraits", () => {
  it("crée puis confirme un retrait par vérification", async () => {
    const { engine, events } = setup();
    const payout = await engine.createPayout(payoutInput, "idem-po-1");
    expect(payout).toMatchObject({ status: "processing", recipientPhone: "+2290197000001", providerRef: "po_ref" });
    expect((await engine.refreshPayout(payout.id)).status).toBe("succeeded");
    expect(events.map((e) => e.type)).toEqual(["payout.processing", "payout.succeeded"]);
  });

  it("est idempotent et refuse un contenu différent pour la même clé", async () => {
    const { engine } = setup();
    const first = await engine.createPayout(payoutInput, "idem-po-2");
    expect((await engine.createPayout(payoutInput, "idem-po-2")).id).toBe(first.id);
    await expectPontError(engine.createPayout({ ...payoutInput, amount: 3000 }, "idem-po-2"), "idempotency_conflict");
  });

  it("une clé de paiement et une clé de retrait identiques ne se mélangent pas", async () => {
    const { engine } = setup();
    await engine.createPayment(baseInput, "idem-shared");
    const payout = await engine.createPayout(payoutInput, "idem-shared");
    expect(payout.id.startsWith("po_")).toBe(true);
  });

  it("timeout à l'envoi → à réconcilier, puis montant divergent refusé", async () => {
    const adapter = new FakeAdapter("pawapay");
    adapter.payoutOutcome = { kind: "ambiguous", reason: "timeout" };
    adapter.payoutVerify = { kind: "ok", value: { status: "succeeded", amount: 9999, currency: "XOF", providerRef: "x", failureCode: null } };
    const { engine } = setup(adapter);
    const payout = await engine.createPayout(payoutInput, "idem-po-3");
    expect(payout).toMatchObject({ status: "processing", needsReconciliation: true });
    expect(await engine.refreshPayout(payout.id)).toMatchObject({ status: "failed", failureCode: "amount_mismatch", needsReconciliation: true });
  });

  it("exige l'opérateur", async () => {
    const { engine } = setup();
    const { operator: _omitted, ...withoutOperator } = payoutInput;
    await expectPontError(engine.createPayout(withoutOperator, "idem-po-4"), "invalid_request");
  });
});

describe("remboursements", () => {
  it("refuse de rembourser un paiement non réussi", async () => {
    const adapter = new FakeAdapter("pawapay");
    const { engine } = setup(adapter);
    const pending = await engine.createPayment(baseInput, "idem-pending");
    await expectPontError(engine.createRefund(pending.id, {}, "idem-re-0"), "invalid_request");
  });

  it("remboursement total : signalé comme total à l'agrégateur, paiement → refunded", async () => {
    const { engine, adapter, events } = setup();
    const paid = await succeededPayment(engine);
    const refund = await engine.createRefund(paid.id, {}, "idem-re-1");
    expect(refund).toMatchObject({ amount: 5000, status: "pending" });
    expect(adapter.refundRequests[0]?.full).toBe(true);
    await engine.refreshRefund(refund.id);
    expect((await engine.getPayment(paid.id)).status).toBe("refunded");
    expect(events.map((e) => e.type)).toContain("payment.refunded");
  });

  it("remboursements partiels cumulés, jamais au-delà du montant payé", async () => {
    const { engine, adapter } = setup();
    const paid = await succeededPayment(engine);
    const first = await engine.createRefund(paid.id, { amount: 3000 }, "idem-re-2");
    expect(adapter.refundRequests[0]?.full).toBe(false);
    await engine.refreshRefund(first.id);
    expect((await engine.getPayment(paid.id)).status).toBe("partially_refunded");
    await expectPontError(engine.createRefund(paid.id, { amount: 2500 }, "idem-re-3"), "invalid_request");
    const second = await engine.createRefund(paid.id, { amount: 2000 }, "idem-re-4");
    await engine.refreshRefund(second.id);
    expect((await engine.getPayment(paid.id)).status).toBe("refunded");
  });

  it("refuse si l'agrégateur ne rembourse pas par API", async () => {
    const adapter = new FakeAdapter("fedapay");
    adapter.supports = (country, _operator, capability) => country === "BJ" && capability !== "refund";
    const { engine } = setup(adapter);
    const paid = await succeededPayment(engine);
    await expectPontError(engine.createRefund(paid.id, {}, "idem-re-5"), "no_provider_available");
  });
});

describe("relais de webhooks sortants", () => {
  const event: PontEvent = {
    id: "evt_1",
    type: "payment.succeeded",
    createdAt: 0,
    object: "payment",
    data: {
      id: "pay_1", mode: "test", status: "succeeded", amount: 5000, currency: "XOF", country: "BJ", provider: "fedapay",
      attemptId: "secret-attempt", providerRef: "1", operator: null, reference: "order_1", nextAction: null,
      failureCode: null, needsReconciliation: false, metadata: {}, createdAt: 0, updatedAt: 0,
    },
  };

  it("livre une requête signée vérifiable, sans données internes", async () => {
    let now = 1_000_000;
    const received: Array<{ body: string; signature: string | null }> = [];
    const relay = new WebhookRelay({
      mode: "live",
      endpoints: [{ id: "we_1", url: "https://marchand.bj/pont/webhook", secret: "whsec_1" }],
      store: new MemoryDeliveryStore(),
      now: () => now,
      fetch: async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        received.push({ body: String(init?.body), signature: headers["pont-signature"] ?? null });
        return new Response("ok", { status: 200 });
      },
    });
    await relay.enqueue(event);
    const [delivery] = await relay.processDue();
    expect(delivery?.status).toBe("delivered");
    expect(verifyPontWebhook("whsec_1", received[0]!.body, received[0]!.signature, { now: Math.floor(now / 1000) })).toBe(true);
    expect(received[0]!.body).not.toContain("secret-attempt");
  });

  it("réessaie selon le calendrier puis abandonne", async () => {
    let now = 0;
    const relay = new WebhookRelay({
      mode: "live",
      endpoints: [{ id: "we_1", url: "https://marchand.bj/pont/webhook", secret: "s" }],
      store: new MemoryDeliveryStore(),
      now: () => now,
      scheduleSeconds: [0, 60, 300],
      fetch: async () => new Response("err", { status: 500 }),
    });
    await relay.enqueue(event);
    let [delivery] = await relay.processDue();
    expect(delivery).toMatchObject({ status: "pending", nextAttemptAt: 60_000 });
    expect(await relay.processDue()).toHaveLength(0); // pas encore dû
    now = 60_000;
    [delivery] = await relay.processDue();
    expect(delivery).toMatchObject({ status: "pending", nextAttemptAt: 300_000 });
    now = 300_000;
    [delivery] = await relay.processDue();
    expect(delivery?.status).toBe("failed");
    expect(delivery?.attempts).toHaveLength(3);
  });

  it("refuse les URL dangereuses (SSRF, HTTP en live)", () => {
    for (const url of ["http://marchand.bj/h", "https://127.0.0.1/h", "https://10.0.0.5/h", "https://192.168.1.2/h", "https://localhost/h", "https://user:pw@marchand.bj/h", "https://[fd00::1]/h"]) {
      expect(() => assertDeliverableUrl(url, "live")).toThrow(PontError);
    }
    expect(() => assertDeliverableUrl("https://marchand.bj/h", "live")).not.toThrow();
    expect(() => assertDeliverableUrl("http://localhost:3000/h", "test")).not.toThrow();
  });
});
