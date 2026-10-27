import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { InsufficientFundsError, Ledger, Wallets } from "@pont/ledger";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaLedgerStore, type PontPrismaLedgerClient } from "../src/ledger.js";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:pont@localhost:55432/pont_test";
// Pool large : les tests de concurrence ouvrent de vraies connexions parallèles.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 20 }) });
let available = true;

beforeAll(async () => {
  try {
    await prisma.pontLedgerAccount.count();
  } catch {
    available = false;
  }
});

beforeEach(async () => {
  if (!available) return;
  await prisma.$transaction([prisma.pontLedgerLine.deleteMany(), prisma.pontLedgerEntry.deleteMany(), prisma.pontLedgerAccount.deleteMany()]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function wallets() {
  const ledger = new Ledger(new PrismaLedgerStore(prisma as unknown as PontPrismaLedgerClient));
  return { ledger, wallets: new Wallets(ledger) };
}

describe("registre sur Postgres (R-030, R-031)", () => {
  it("dépôt idempotent, blocage, solde, restitution", async ({ skip }) => {
    if (!available) skip();
    const { wallets: w } = wallets();
    await w.open("awa", "XOF");
    await w.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    await w.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    await w.hold({ userId: "awa", currency: "XOF", amount: 4_000, holdId: "po_1" });
    await w.release({ userId: "awa", currency: "XOF", amount: 4_000, holdId: "po_1" });
    expect(await w.balance("awa", "XOF")).toEqual({ available: 10_000, held: 0, currency: "XOF" });
    expect(await prisma.pontLedgerEntry.count()).toBe(3);
  });

  it("découvert refusé et transaction annulée en entier (aucune écriture partielle)", async ({ skip }) => {
    if (!available) skip();
    const { wallets: w } = wallets();
    await w.open("awa", "XOF");
    await w.deposit({ userId: "awa", currency: "XOF", amount: 1_000, provider: "fedapay", paymentId: "pay_1" });
    await expect(w.hold({ userId: "awa", currency: "XOF", amount: 1_001, holdId: "po_x" })).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await prisma.pontLedgerEntry.count()).toBe(1);
    expect(await prisma.pontLedgerLine.count()).toBe(2);
    expect(await w.balance("awa", "XOF")).toMatchObject({ available: 1_000, held: 0 });
  });

  it("50 retraits simultanés (20 connexions) de 1 000 sur 10 000 : exactement 10 passent, jamais de solde négatif", async ({ skip }) => {
    if (!available) skip();
    const { wallets: w } = wallets();
    await w.open("awa", "XOF");
    await w.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => w.hold({ userId: "awa", currency: "XOF", amount: 1_000, holdId: `po_${i}` })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const refused = results.filter((r) => r.status === "rejected" && r.reason instanceof InsufficientFundsError).length;
    expect({ ok, refused }).toEqual({ ok: 10, refused: 40 });
    expect(await w.balance("awa", "XOF")).toMatchObject({ available: 0, held: 10_000 });
    // Le solde matérialisé correspond toujours à la somme des lignes.
    const account = await prisma.pontLedgerAccount.findUnique({ where: { code: "wallet:awa:XOF:available" } });
    const lines = await prisma.pontLedgerLine.findMany({ where: { accountId: account!.id } });
    const sum = lines.reduce((s, l) => s + (l.direction === "credit" ? Number(l.amount) : -Number(l.amount)), 0);
    expect(sum).toBe(Number(account!.balance));
  });

  it("même écriture envoyée 20 fois en parallèle : une seule enregistrée", async ({ skip }) => {
    if (!available) skip();
    const { wallets: w } = wallets();
    await w.open("awa", "XOF");
    await Promise.allSettled(Array.from({ length: 20 }, () => w.deposit({ userId: "awa", currency: "XOF", amount: 5_000, provider: "fedapay", paymentId: "pay_same" })));
    expect(await w.balance("awa", "XOF")).toMatchObject({ available: 5_000 });
    expect(await prisma.pontLedgerEntry.count()).toBe(1);
  });
});
