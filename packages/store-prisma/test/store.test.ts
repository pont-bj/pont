import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PontEngine } from "@pont/engine";
import { SandboxAdapter } from "@pont/sandbox";
import { createWorkflow } from "@pont/framework";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaStores, type PontPrismaClient } from "../src/index.js";

// Tests sur un vrai Postgres (conteneur `pont-test-pg`, port 55432). Ignorés si DATABASE_URL est injoignable.
const url = process.env.DATABASE_URL ?? "postgresql://postgres:pont@localhost:55432/pont_test";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
let available = true;

beforeAll(async () => {
  try {
    await prisma.pontIdempotency.count();
  } catch {
    available = false;
  }
});

beforeEach(async () => {
  if (!available) return;
  await prisma.$transaction([
    prisma.pontRecord.deleteMany(),
    prisma.pontIdempotency.deleteMany(),
    prisma.pontDelivery.deleteMany(),
    prisma.pontSecret.deleteMany(),
    prisma.pontWorkflowRun.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const client = prisma as unknown as PontPrismaClient;

function engine(now = () => Date.now()) {
  const stores = createPrismaStores(client);
  return {
    stores,
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

describe("stores Prisma Postgres", () => {
  it("paiement complet, idempotence, métadonnées libres", async ({ skip }) => {
    if (!available) skip();
    const { engine: pont, stores } = engine();
    const input = { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "o1", metadata: { _x: "1", $y: "2" } };
    const created = await pont.createPayment(input, "idem-pg-1");
    expect((await pont.createPayment(input, "idem-pg-1")).id).toBe(created.id);
    expect((await stores.payments.findByAttempt("sandbox", created.attemptId))?.metadata).toEqual({ _x: "1", $y: "2" });
    expect((await pont.refreshPayment(created.id)).status).toBe("succeeded");
  });

  it("idempotence sous concurrence : 20 créations simultanées, un seul paiement", async ({ skip }) => {
    if (!available) skip();
    const { engine: pont } = engine();
    const input = { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "o2" };
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => pont.createPayment(input, "idem-concurrent")));
    const ids = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(ids.size).toBe(1);
    expect(await prisma.pontRecord.count({ where: { kind: "payment" } })).toBe(1);
  });

  it("réconciliation d'un paiement ambigu", async ({ skip }) => {
    if (!available) skip();
    let now = 1_000_000;
    const { engine: pont, stores } = engine(() => now);
    const ambiguous = await pont.createPayment({ amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000007" }, reference: "o3" }, "idem-pg-3");
    expect(ambiguous.needsReconciliation).toBe(true);
    now += 120_000;
    expect(await pont.reconcile()).toEqual({ checked: 1, changed: 1, errors: 0 });
    expect(await stores.payments.listUnsettled(now, 10)).toHaveLength(0);
  });

  it("workflows : bail atomique et reprise", async ({ skip }) => {
    if (!available) skip();
    const store = createPrismaStores(client).workflowRuns;
    let now = 0;
    const calls: string[] = [];
    const hanging = createWorkflow<{ n: number }>("pg-wf", [
      { name: "a", invoke: async (i) => { calls.push(`a${i.n}`); return 1; } },
      { name: "b", invoke: () => new Promise(() => {}) },
    ]);
    void hanging.run({ n: 1 }, { idempotencyKey: "k", store, now: () => now, leaseMs: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const resume = createWorkflow<{ n: number }>("pg-wf", [
      { name: "a", invoke: async (i) => { calls.push(`a${i.n}`); return 1; } },
      { name: "b", invoke: async (i) => { calls.push(`b${i.n}`); return 2; } },
    ]);
    await expect(resume.run({ n: 9 }, { idempotencyKey: "k", store, now: () => now })).rejects.toThrow(/déjà en cours/);
    now = 5_000;
    // Deux reprises simultanées : une seule obtient le bail.
    const [first, second] = await Promise.allSettled([
      resume.run({ n: 9 }, { idempotencyKey: "k", store, now: () => now }),
      resume.run({ n: 9 }, { idempotencyKey: "k", store, now: () => now }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["fulfilled", "rejected"]);
    expect(calls).toEqual(["a1", "b1"]);
  });
});

describe("livraisons et coffre sur Postgres", () => {
  it("liste les livraisons récentes d'abord", async ({ skip }) => {
    if (!available) skip();
    const { deliveries } = createPrismaStores(client);
    const make = (id: string, createdAt: number) => ({ id, eventId: "evt", endpointId: "app", url: "https://app.exemple.bj", body: "{}", status: "pending" as const, attempts: [], nextAttemptAt: createdAt, createdAt });
    await deliveries.insert(make("whd_1", 1000));
    await deliveries.insert(make("whd_2", 3000));
    await deliveries.insert(make("whd_3", 2000));
    expect((await deliveries.listRecent(2)).map((d) => d.id)).toEqual(["whd_2", "whd_3"]);
  });

  it("stocke, remplace, liste par préfixe et supprime les secrets", async ({ skip }) => {
    if (!available) skip();
    const { secrets } = createPrismaStores(client);
    expect(await secrets.get("provider:fedapay")).toBeNull();
    await secrets.put("provider:fedapay", "v1.a");
    await secrets.put("provider:fedapay", "v1.b");
    await secrets.put("endpoint:ep_1", "v1.c");
    expect(await secrets.get("provider:fedapay")).toBe("v1.b");
    expect((await secrets.list("provider:")).map((e) => e.key)).toEqual(["provider:fedapay"]);
    await secrets.delete("provider:fedapay");
    await secrets.delete("provider:absent");
    expect(await secrets.get("provider:fedapay")).toBeNull();
    expect(await secrets.list("endpoint:")).toHaveLength(1);
  });
});
