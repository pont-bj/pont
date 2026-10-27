import { describe, expect, it } from "vitest";
import { PontError } from "@pont/core";
import { createApp } from "@pont/framework";
import {
  InsufficientFundsError,
  Ledger,
  Limits,
  MemoryCustomerProfileStore,
  MemoryLedgerStore,
  Wallets,
  ledgerModule,
  limitsModule,
  walletsModule,
} from "../src/index.js";

function setup(now = () => Date.now()) {
  const store = new MemoryLedgerStore();
  const ledger = new Ledger(store, now);
  const wallets = new Wallets(ledger);
  return { store, ledger, wallets };
}

describe("registre (R-030, R-031)", () => {
  it("refuse les écritures déséquilibrées, à une ligne, à montant non entier ou multi-devises", async () => {
    const { ledger } = setup();
    const a = await ledger.openAccount({ code: "a", currency: "XOF", normal: "debit", allowNegative: true });
    const b = await ledger.openAccount({ code: "b", currency: "XOF", normal: "credit" });
    const c = await ledger.openAccount({ code: "c", currency: "XAF", normal: "credit" });
    const post = (lines: Array<{ accountId: string; direction: "debit" | "credit"; amount: number }>) => ledger.post({ idempotencyKey: Math.random().toString(), currency: "XOF", description: "t", lines });
    await expect(post([{ accountId: a.id, direction: "debit", amount: 10 }, { accountId: b.id, direction: "credit", amount: 9 }])).rejects.toThrow(/déséquilibrée/);
    await expect(post([{ accountId: a.id, direction: "debit", amount: 10 }])).rejects.toThrow(/deux lignes/);
    await expect(post([{ accountId: a.id, direction: "debit", amount: 1.5 }, { accountId: b.id, direction: "credit", amount: 1.5 }])).rejects.toThrow(/entiers/);
    await expect(post([{ accountId: a.id, direction: "debit", amount: 10 }, { accountId: c.id, direction: "credit", amount: 10 }])).rejects.toThrow(/XOF/);
  });

  it("idempotent : même clé et contenu → doublon ; contenu différent → conflit", async () => {
    const { ledger } = setup();
    const a = await ledger.openAccount({ code: "a", currency: "XOF", normal: "debit", allowNegative: true });
    const b = await ledger.openAccount({ code: "b", currency: "XOF", normal: "credit" });
    const lines = [{ accountId: a.id, direction: "debit" as const, amount: 10 }, { accountId: b.id, direction: "credit" as const, amount: 10 }];
    expect((await ledger.post({ idempotencyKey: "k", currency: "XOF", description: "t", lines })).status).toBe("posted");
    expect((await ledger.post({ idempotencyKey: "k", currency: "XOF", description: "t", lines })).status).toBe("duplicate");
    expect(await ledger.balance(b)).toBe(10);
    await expect(ledger.post({ idempotencyKey: "k", currency: "XOF", description: "t", lines: lines.map((l) => ({ ...l, amount: 20 })) })).rejects.toThrow(PontError);
  });

  it("correction par écriture inverse, jamais par suppression", async () => {
    const { ledger } = setup();
    const a = await ledger.openAccount({ code: "a", currency: "XOF", normal: "debit", allowNegative: true });
    const b = await ledger.openAccount({ code: "b", currency: "XOF", normal: "credit" });
    const posted = await ledger.post({ idempotencyKey: "k", currency: "XOF", description: "erreur", lines: [{ accountId: a.id, direction: "debit", amount: 50 }, { accountId: b.id, direction: "credit", amount: 50 }] });
    if (posted.status !== "posted") throw new Error("attendu posted");
    const reversed = await ledger.reverse(posted.entry.id, "k-rev", "correction");
    expect(reversed.status === "posted" && reversed.entry.reverses).toBe(posted.entry.id);
    expect(await ledger.balance(b)).toBe(0);
    expect(await ledger.movements(b)).toHaveLength(2);
  });
});

describe("portefeuilles (R-031 à R-033)", () => {
  it("dépôt crédité une seule fois par paiement", async () => {
    const { wallets } = setup();
    await wallets.open("awa", "XOF");
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    expect(await wallets.balance("awa", "XOF")).toEqual({ available: 10_000, held: 0, currency: "XOF" });
  });

  it("retrait : blocage, puis solde ou restitution", async () => {
    const { wallets } = setup();
    await wallets.open("awa", "XOF");
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "pawapay", paymentId: "pay_1" });
    await wallets.hold({ userId: "awa", currency: "XOF", amount: 6_000, holdId: "po_1" });
    expect(await wallets.balance("awa", "XOF")).toMatchObject({ available: 4_000, held: 6_000 });
    await wallets.settle({ userId: "awa", currency: "XOF", amount: 6_000, fee: 100, holdId: "po_1", provider: "pawapay" });
    expect(await wallets.balance("awa", "XOF")).toMatchObject({ available: 4_000, held: 0 });

    await wallets.hold({ userId: "awa", currency: "XOF", amount: 3_000, holdId: "po_2" });
    await wallets.release({ userId: "awa", currency: "XOF", amount: 3_000, holdId: "po_2" });
    expect(await wallets.balance("awa", "XOF")).toMatchObject({ available: 4_000, held: 0 });
  });

  it("jamais de découvert : blocage au-delà du disponible refusé", async () => {
    const { wallets } = setup();
    await wallets.open("awa", "XOF");
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 5_000, provider: "fedapay", paymentId: "pay_1" });
    await expect(wallets.hold({ userId: "awa", currency: "XOF", amount: 5_001, holdId: "po_x" })).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await wallets.balance("awa", "XOF")).toMatchObject({ available: 5_000, held: 0 });
  });

  it("50 retraits simultanés de 1 000 sur un solde de 10 000 : exactement 10 passent", async () => {
    const { wallets } = setup();
    await wallets.open("awa", "XOF");
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => wallets.hold({ userId: "awa", currency: "XOF", amount: 1_000, holdId: `po_${i}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await wallets.balance("awa", "XOF")).toMatchObject({ available: 0, held: 10_000 });
  });

  it("transfert interne avec frais à la charge de l'émetteur", async () => {
    const { wallets } = setup();
    await wallets.open("awa", "XOF");
    await wallets.open("koffi", "XOF");
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 10_000, provider: "fedapay", paymentId: "pay_1" });
    await wallets.transfer({ from: "awa", to: "koffi", currency: "XOF", amount: 3_000, fee: 50, transferId: "tr_1" });
    expect((await wallets.balance("awa", "XOF")).available).toBe(6_950);
    expect((await wallets.balance("koffi", "XOF")).available).toBe(3_000);
    await expect(wallets.transfer({ from: "awa", to: "awa", currency: "XOF", amount: 1, transferId: "tr_2" })).rejects.toThrow(/soi-même/);
  });

  it("portefeuille inexistant : message actionnable", async () => {
    const { wallets } = setup();
    await expect(wallets.balance("inconnu", "XOF")).rejects.toThrow(/inexistant/);
  });
});

describe("plafonds (R-035)", () => {
  const tiers = {
    basique: { maxBalance: 200_000, maxSingle: 50_000, maxDailyOut: 100_000, maxMonthlyOut: 500_000 },
    complet: { maxBalance: 2_000_000, maxSingle: 500_000, maxDailyOut: 1_000_000, maxMonthlyOut: 5_000_000 },
  };

  async function setupLimits() {
    let now = 1_000_000_000_000;
    const { wallets } = setup(() => now);
    const profiles = new MemoryCustomerProfileStore();
    const limits = new Limits({ tiers }, wallets, profiles, () => now);
    await wallets.open("awa", "XOF");
    profiles.setTier("awa", "basique");
    await wallets.deposit({ userId: "awa", currency: "XOF", amount: 160_000, provider: "fedapay", paymentId: "pay_1" });
    return { limits, wallets, profiles, advance: (ms: number) => (now += ms) };
  }

  it("opération unitaire, solde maximal, palier inconnu", async () => {
    const { limits, profiles } = await setupLimits();
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "withdraw", amount: 60_000 })).toMatchObject({ allowed: false, code: "max_single" });
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "deposit", amount: 50_001 })).toMatchObject({ allowed: false, code: "max_single" });
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "deposit", amount: 50_000 })).toMatchObject({ allowed: false, code: "max_balance" });
    // Atteindre exactement le plafond (160 000 + 40 000 = 200 000) est permis.
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "deposit", amount: 40_000 })).toEqual({ allowed: true });
    profiles.setTier("awa", "inexistant");
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "withdraw", amount: 1 })).toMatchObject({ code: "unknown_tier" });
  });

  it("sorties sur 24 h glissantes, puis rétablies le lendemain", async () => {
    const { limits, wallets, advance } = await setupLimits();
    await wallets.hold({ userId: "awa", currency: "XOF", amount: 50_000, holdId: "po_1" });
    await wallets.hold({ userId: "awa", currency: "XOF", amount: 40_000, holdId: "po_2" });
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "withdraw", amount: 20_000 })).toMatchObject({ allowed: false, code: "max_daily_out" });
    advance(25 * 60 * 60 * 1000);
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "withdraw", amount: 20_000 })).toEqual({ allowed: true });
  });

  it("compte gelé : aucune sortie, les entrées restent possibles", async () => {
    const { limits, profiles } = await setupLimits();
    profiles.freeze("awa");
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "withdraw", amount: 1_000 })).toMatchObject({ code: "frozen" });
    expect(await limits.check({ userId: "awa", currency: "XOF", operation: "deposit", amount: 1_000 })).toEqual({ allowed: true });
  });

  it("configuration invalide refusée", () => {
    const { wallets } = setup();
    expect(() => new Limits({ tiers: {} }, wallets, new MemoryCustomerProfileStore())).toThrow(/Au moins un palier/);
    expect(() => new Limits({ tiers: { a: { maxBalance: 1 } } }, wallets, new MemoryCustomerProfileStore())).toThrow(PontError);
  });
});

describe("modules du framework", () => {
  it("s'assemblent dans l'ordre et sont marqués propriétaires", async () => {
    const app = await createApp({
      modules: [limitsModule, walletsModule, ledgerModule],
      config: { limits: { tiers: { basique: { maxBalance: 1, maxSingle: 1, maxDailyOut: 1, maxMonthlyOut: 1 } } } },
    });
    expect(app.modules.map((m) => `${m.name}:${m.license}`)).toEqual(["ledger:proprietary", "wallets:proprietary", "limits:proprietary"]);
    await app.module<Wallets>("wallets").open("awa", "XOF");
    expect(await app.module<Wallets>("wallets").balance("awa", "XOF")).toMatchObject({ available: 0 });
  });
});
