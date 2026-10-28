import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { InsufficientFundsError, Ledger, Wallets } from "@pont/ledger";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaCustomerProfileStore, PrismaLedgerStore, type PontPrismaLedgerClient, type PontPrismaProfileClient } from "../src/ledger.js";

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
  await prisma.$transaction([prisma.pontLedgerLine.deleteMany(), prisma.pontLedgerEntry.deleteMany(), prisma.pontLedgerAccount.deleteMany(), prisma.pontCustomerProfile.deleteMany()]);
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

describe("listes pour le dashboard", () => {
  it("liste les comptes avec leur solde et filtre par préfixe", async ({ skip }) => {
    if (!available) skip();
    const { wallets: w } = wallets();
    await w.open("awa", "XOF");
    await w.open("koffi", "XOF");
    await w.deposit({ userId: "awa", currency: "XOF", amount: 7_000, provider: "fedapay", paymentId: "pay_a" });
    const store = new PrismaLedgerStore(prisma as unknown as PontPrismaLedgerClient);
    const wallet = await store.listAccounts({ prefix: "wallet:awa:" });
    expect(wallet.map((a) => a.code).sort()).toEqual(["wallet:awa:XOF:available", "wallet:awa:XOF:held"]);
    expect(wallet.find((a) => a.code.endsWith(":available"))?.balance).toBe(7_000);
    expect((await store.listAccounts({ prefix: "system:" })).map((a) => a.code)).toContain("system:transit:fedapay:XOF");
    expect(await store.listAccounts({ limit: 2 })).toHaveLength(2);
  });

  it("liste les écritures, les plus récentes d'abord, avec leurs lignes", async ({ skip }) => {
    if (!available) skip();
    const { wallets: w } = wallets();
    await w.open("awa", "XOF");
    await w.deposit({ userId: "awa", currency: "XOF", amount: 5_000, provider: "fedapay", paymentId: "pay_1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await w.deposit({ userId: "awa", currency: "XOF", amount: 3_000, provider: "fedapay", paymentId: "pay_2" });
    const entries = await new PrismaLedgerStore(prisma as unknown as PontPrismaLedgerClient).listEntries(10);
    expect(entries.map((e) => e.idempotencyKey)).toEqual(["deposit:pay_2", "deposit:pay_1"]);
    expect(entries[0]?.lines).toHaveLength(2);
    expect(entries[0]?.lines.reduce((sum, l) => sum + (l.direction === "debit" ? l.amount : -l.amount), 0)).toBe(0);
  });
});

describe("profils clients sur Postgres", () => {
  it("conserve le palier et le gel, par utilisateur", async ({ skip }) => {
    if (!available) skip();
    const profiles = new PrismaCustomerProfileStore(prisma as unknown as PontPrismaProfileClient);
    expect(await profiles.getTier("awa")).toBeNull();
    expect(await profiles.isFrozen("awa")).toBe(false);
    await profiles.setTier("awa", "basique");
    await profiles.setFrozen("awa", true);
    expect(await profiles.getTier("awa")).toBe("basique");
    expect(await profiles.isFrozen("awa")).toBe(true);
    await profiles.setTier("awa", "complet");
    expect(await profiles.isFrozen("awa")).toBe(true);
    await profiles.setFrozen("awa", false);
    expect(await profiles.isFrozen("awa")).toBe(false);
    expect(await profiles.getTier("awa")).toBe("complet");
    expect(await profiles.getTier("koffi")).toBeNull();
  });
});
