import { describe, expect, it } from "vitest";
import { PontError } from "@pont/core";
import { SandboxAdapter } from "@pont/sandbox";
import { KkiapayAdapter } from "@pont/adapter-kkiapay";
import { FedaPayAdapter } from "@pont/adapter-fedapay";
import { MemoryIdempotencyStore, MemoryPaymentStore, PontEngine, buildWebhookDelivery, type PontEvent } from "../src/index.js";
import { verifyPontWebhook } from "@pont/core";
import { FakeAdapter, baseInput } from "./helpers.js";

function makeEngine(adapters: ConstructorParameters<typeof PontEngine>[0]["adapters"], options: { failover?: boolean } = {}) {
  const events: PontEvent[] = [];
  const paymentStore = new MemoryPaymentStore();
  const engine = new PontEngine({
    adapters,
    paymentStore,
    idempotencyStore: new MemoryIdempotencyStore(),
    callbackUrl: (provider) => `https://marchand.bj/pont/hooks/${provider}`,
    failover: options.failover ?? false,
    onEvent: (event) => {
      events.push(event);
    },
  });
  return { engine, events, paymentStore };
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

describe("sandbox Pont (numéros magiques)", () => {
  const sandbox = () => makeEngine([new SandboxAdapter()]);

  it("…0000001 : succès, confirmé uniquement après vérification (R-001)", async () => {
    const { engine, events } = sandbox();
    const created = await engine.createPayment({ ...baseInput, customer: { phone: "+2290100000001" } }, "idem-success");
    expect(created.status).toBe("pending");
    expect(created.nextAction?.type).toBe("await_customer");
    const refreshed = await engine.refreshPayment(created.id);
    expect(refreshed.status).toBe("succeeded");
    expect(events.map((e) => e.type)).toEqual(["payment.pending", "payment.succeeded"]);
  });

  it("…0000002 : solde insuffisant", async () => {
    const { engine } = sandbox();
    const created = await engine.createPayment({ ...baseInput, customer: { phone: "+2290100000002" } }, "idem-funds");
    const refreshed = await engine.refreshPayment(created.id);
    expect(refreshed).toMatchObject({ status: "failed", failureCode: "insufficient_funds" });
  });

  it("…0000003 : jamais confirmé, expire après le délai", async () => {
    let now = 0;
    const engine = new PontEngine({
      adapters: [new SandboxAdapter({ now: () => now, expiryMs: 1_000 })],
      paymentStore: new MemoryPaymentStore(),
      idempotencyStore: new MemoryIdempotencyStore(),
      callbackUrl: () => "https://x.bj/hook",
      now: () => now,
    });
    const created = await engine.createPayment({ ...baseInput, customer: { phone: "+2290100000003" } }, "idem-expire");
    expect((await engine.refreshPayment(created.id)).status).toBe("pending");
    now = 2_000;
    expect((await engine.refreshPayment(created.id)).status).toBe("expired");
  });

  it("…0000007 : timeout ambigu → processing à réconcilier, pas de nouvel essai (R-005)", async () => {
    const { engine, events } = sandbox();
    const created = await engine.createPayment({ ...baseInput, customer: { phone: "+2290100000007" } }, "idem-ambiguous");
    expect(created).toMatchObject({ status: "processing", needsReconciliation: true });
    expect(events[0]?.type).toBe("payment.needs_reconciliation");
    const reconciled = await engine.refreshPayment(created.id);
    expect(reconciled).toMatchObject({ status: "succeeded", needsReconciliation: false });
  });
});

describe("idempotence (R-004)", () => {
  it("rejoue la même réponse pour la même clé et le même contenu, sans rappeler l'agrégateur", async () => {
    const fake = new FakeAdapter("fedapay");
    const { engine } = makeEngine([fake]);
    const first = await engine.createPayment(baseInput, "idem-key-1");
    const second = await engine.createPayment({ ...baseInput }, "idem-key-1");
    expect(second.id).toBe(first.id);
    expect(fake.createCalls).toBe(1);
  });

  it("refuse la même clé avec un contenu différent", async () => {
    const { engine } = makeEngine([new FakeAdapter("fedapay")]);
    await engine.createPayment(baseInput, "idem-key-2");
    await expectPontError(engine.createPayment({ ...baseInput, amount: 9000 }, "idem-key-2"), "idempotency_conflict");
  });

  it("exige une clé d'idempotence", async () => {
    const { engine } = makeEngine([new FakeAdapter("fedapay")]);
    await expectPontError(engine.createPayment(baseInput, ""), "invalid_request");
  });
});

describe("validation et routage", () => {
  it("normalise le téléphone avant d'appeler l'agrégateur", async () => {
    const fake = new FakeAdapter("fedapay");
    const { engine } = makeEngine([fake]);
    await engine.createPayment({ ...baseInput, customer: { phone: "01 97 00 00 01" } }, "idem-phone");
    expect(fake.lastRequest?.input.customer.phone).toBe("+2290197000001");
  });

  it("refuse un montant décimal (R-002)", async () => {
    const { engine } = makeEngine([new FakeAdapter("fedapay")]);
    await expectPontError(engine.createPayment({ ...baseInput, amount: 99.5 }, "idem-decimal"), "invalid_request");
  });

  it("signale l'absence de couverture sans consommer la clé d'idempotence", async () => {
    const { engine } = makeEngine([new FakeAdapter("fedapay", ["BJ"])]);
    const input = { ...baseInput, country: "SN", customer: { phone: "+221771234567" } };
    await expectPontError(engine.createPayment(input, "idem-cov"), "no_provider_available");
    await expectPontError(engine.createPayment(input, "idem-cov"), "no_provider_available");
  });

  it("une exception d'adaptateur laisse un paiement à réconcilier, jamais une trace perdue", async () => {
    const fake = new FakeAdapter("fedapay");
    fake.createDeposit = async () => {
      throw new Error("bug");
    };
    const { engine } = makeEngine([fake]);
    const payment = await engine.createPayment(baseInput, "idem-throw");
    expect(payment).toMatchObject({ status: "processing", needsReconciliation: true, failureCode: "adapter_error" });
    expect((await engine.createPayment(baseInput, "idem-throw")).id).toBe(payment.id);
  });

  it("respecte l'agrégateur préféré par pays", async () => {
    const fedapay = new FakeAdapter("fedapay");
    const pawapay = new FakeAdapter("pawapay");
    const engine = new PontEngine({
      adapters: [fedapay, pawapay],
      paymentStore: new MemoryPaymentStore(),
      idempotencyStore: new MemoryIdempotencyStore(),
      callbackUrl: () => "https://x.bj/hook",
      routing: [{ country: "BJ", provider: "pawapay" }],
    });
    const payment = await engine.createPayment(baseInput, "idem-route");
    expect(payment.provider).toBe("pawapay");
    expect(fedapay.createCalls).toBe(0);
  });
});

describe("failover (R-005, R-006)", () => {
  it("bascule quand le premier agrégateur est indisponible avant envoi", async () => {
    const first = new FakeAdapter("fedapay");
    first.createOutcome = { kind: "unavailable_before_push", reason: "ENOTFOUND" };
    const second = new FakeAdapter("pawapay");
    const { engine } = makeEngine([first, second], { failover: true });
    const payment = await engine.createPayment(baseInput, "idem-failover");
    expect(payment).toMatchObject({ provider: "pawapay", status: "pending" });
    expect(first.lastRequest?.attemptId).not.toBe(second.lastRequest?.attemptId);
  });

  it("ne bascule jamais sur un statut ambigu", async () => {
    const first = new FakeAdapter("fedapay");
    first.createOutcome = { kind: "ambiguous", reason: "timeout" };
    const second = new FakeAdapter("pawapay");
    const { engine } = makeEngine([first, second], { failover: true });
    const payment = await engine.createPayment(baseInput, "idem-noretry");
    expect(payment).toMatchObject({ provider: "fedapay", status: "processing", needsReconciliation: true });
    expect(second.createCalls).toBe(0);
  });

  it("ne bascule pas quand le failover est désactivé", async () => {
    const first = new FakeAdapter("fedapay");
    first.createOutcome = { kind: "unavailable_before_push", reason: "ENOTFOUND" };
    const second = new FakeAdapter("pawapay");
    const { engine } = makeEngine([first, second], { failover: false });
    const payment = await engine.createPayment(baseInput, "idem-nofailover");
    expect(payment).toMatchObject({ provider: "fedapay", status: "failed", failureCode: "provider_unavailable" });
    expect(second.createCalls).toBe(0);
  });

  it("ne bascule pas sur un refus explicite", async () => {
    const first = new FakeAdapter("fedapay");
    first.createOutcome = { kind: "rejected", code: "invalid_amount", message: "non" };
    const second = new FakeAdapter("pawapay");
    const { engine } = makeEngine([first, second], { failover: true });
    const payment = await engine.createPayment(baseInput, "idem-rejected");
    expect(payment).toMatchObject({ status: "failed", failureCode: "invalid_amount" });
    expect(second.createCalls).toBe(0);
  });
});

describe("intégrité de la vérification (R-013)", () => {
  it("refuse un succès dont le montant diffère", async () => {
    const fake = new FakeAdapter("fedapay");
    fake.verifyOutcome = { kind: "ok", value: { status: "succeeded", amount: 100, currency: "XOF", providerRef: "ref_1", failureCode: null } };
    const { engine, events } = makeEngine([fake]);
    const created = await engine.createPayment(baseInput, "idem-mismatch");
    const refreshed = await engine.refreshPayment(created.id);
    expect(refreshed).toMatchObject({ status: "failed", failureCode: "amount_mismatch", needsReconciliation: true });
    expect(events.at(-1)?.type).toBe("payment.needs_reconciliation");
  });

  it("refuse un succès rattaché à une autre tentative", async () => {
    const fake = new FakeAdapter("fedapay");
    fake.verifyOutcome = { kind: "ok", value: { status: "succeeded", amount: 5000, currency: "XOF", providerRef: "ref_1", failureCode: null, attemptRef: "autre" } };
    const { engine } = makeEngine([fake]);
    const created = await engine.createPayment(baseInput, "idem-attempt");
    expect((await engine.refreshPayment(created.id)).failureCode).toBe("attempt_mismatch");
  });

  it("ne repasse jamais un paiement échoué en succès", async () => {
    const fake = new FakeAdapter("fedapay");
    fake.verifyOutcome = { kind: "ok", value: { status: "failed", amount: 5000, currency: "XOF", providerRef: "ref_1", failureCode: "declined" } };
    const { engine } = makeEngine([fake]);
    const created = await engine.createPayment(baseInput, "idem-final");
    await engine.refreshPayment(created.id);
    fake.verifyOutcome = { kind: "ok", value: { status: "succeeded", amount: 5000, currency: "XOF", providerRef: "ref_1", failureCode: null } };
    const again = await engine.refreshPayment(created.id);
    expect(again.status).toBe("failed");
    expect(fake.verifyCalls).toBe(1);
  });
});

describe("webhooks entrants (R-003)", () => {
  it("rejette une signature invalide", async () => {
    const { engine } = makeEngine([new FakeAdapter("fedapay")]);
    await expectPontError(engine.handleProviderWebhook("fedapay", new Headers(), '{"ref":"ref_1"}'), "invalid_signature");
  });

  it("relit le statut via l'API et ignore les doublons", async () => {
    const fake = new FakeAdapter("fedapay");
    const { engine, events } = makeEngine([fake]);
    const created = await engine.createPayment(baseInput, "idem-hook");
    const headers = new Headers({ "x-test-signature": "ok" });
    const first = await engine.handleProviderWebhook("fedapay", headers, '{"ref":"ref_1"}');
    const second = await engine.handleProviderWebhook("fedapay", headers, '{"ref":"ref_1"}');
    expect(first).toEqual({ status: "processed", object: "payment", id: created.id });
    expect((await engine.getPayment(created.id)).status).toBe("succeeded");
    expect(second.status).toBe("processed");
    expect(fake.verifyCalls).toBe(1);
    expect(events.filter((e) => e.type === "payment.succeeded")).toHaveLength(1);
  });

  it("ignore un webhook pour un paiement inconnu", async () => {
    const { engine } = makeEngine([new FakeAdapter("fedapay")]);
    const result = await engine.handleProviderWebhook("fedapay", new Headers({ "x-test-signature": "ok" }), '{"ref":"inconnu"}');
    expect(result).toEqual({ status: "ignored", reason: "opération inconnue" });
  });
});

describe("règles de configuration", () => {
  const kkiapay = () => new KkiapayAdapter({ mode: "test", publicKey: "pk", privateKey: "pv", secretKey: "sk", webhookSecret: "wh" });

  it("refuse Kkiapay avec un autre agrégateur (CGU Art. 18, R-011)", () => {
    expect(
      () =>
        new PontEngine({
          adapters: [kkiapay(), new FedaPayAdapter({ mode: "test", secretKey: "sk", webhookSecret: "wh" })],
          paymentStore: new MemoryPaymentStore(),
          idempotencyStore: new MemoryIdempotencyStore(),
          callbackUrl: () => "https://x.bj/hook",
        }),
    ).toThrow(PontError);
  });

  it("refuse le mélange test / live", () => {
    expect(
      () =>
        new PontEngine({
          adapters: [new FedaPayAdapter({ mode: "live", secretKey: "sk", webhookSecret: "wh" }), new SandboxAdapter()],
          paymentStore: new MemoryPaymentStore(),
          idempotencyStore: new MemoryIdempotencyStore(),
          callbackUrl: () => "https://x.bj/hook",
        }),
    ).toThrow(PontError);
  });
});

describe("widget Kkiapay : rattachement", () => {
  it("refuse de rattacher une transaction déjà utilisée par un autre paiement", async () => {
    const fake = new FakeAdapter("kkiapay");
    fake.createOutcome = {
      kind: "ok",
      value: { providerRef: null, nextAction: { type: "client_widget", provider: "kkiapay", publicKey: "pk", sandbox: true, amount: 5000, partnerId: "x" } },
    };
    fake.verifyOutcome = { kind: "ok", value: { status: "succeeded", amount: 5000, currency: "XOF", providerRef: "tx_real", failureCode: null } };
    const { engine } = makeEngine([fake]);
    const a = await engine.createPayment(baseInput, "idem-widget-a");
    const b = await engine.createPayment({ ...baseInput, reference: "order_4522" }, "idem-widget-b");
    expect((await engine.attachProviderRef(a.id, "tx_real")).status).toBe("succeeded");
    await expectPontError(engine.attachProviderRef(b.id, "tx_real"), "invalid_request");
  });
});

describe("webhook sortant", () => {
  it("produit un corps signé vérifiable par le marchand", async () => {
    const { engine, events } = makeEngine([new SandboxAdapter()]);
    await engine.createPayment({ ...baseInput, customer: { phone: "+2290100000001" } }, "idem-out");
    const delivery = buildWebhookDelivery("whsec_marchand", events[0]!, 1_000);
    expect(verifyPontWebhook("whsec_marchand", delivery.body, delivery.headers["pont-signature"] ?? null, { now: 1_010 })).toBe(true);
    expect(delivery.body).not.toContain("attemptId");
  });
});
