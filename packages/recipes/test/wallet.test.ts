import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore, MemoryPaymentStore, PontEngine, type PontEvent } from "@pont/engine";
import { SandboxAdapter } from "@pont/sandbox";
import { createApp, matchRecipes, planRecipe } from "@pont/framework";
import { Ledger, Limits, MemoryCustomerProfileStore, MemoryLedgerStore, Wallets, ledgerModule, limitsModule, walletsModule } from "@pont/ledger";
import { LimitExceededError, RECIPES, WalletService, paymentsModule, walletRecipe } from "../src/index.js";

const tiers = walletRecipe.config.limits!.tiers as Record<string, { maxBalance: number; maxSingle: number; maxDailyOut: number; maxMonthlyOut: number }>;

/** Portefeuille complet en sandbox : moteur → événements → registre. */
function setup() {
  const ledger = new Ledger(new MemoryLedgerStore());
  const wallets = new Wallets(ledger);
  const profiles = new MemoryCustomerProfileStore();
  const limits = new Limits({ tiers }, wallets, profiles);
  const outcomes: string[] = [];
  let service: WalletService | undefined;
  const engine = new PontEngine({
    adapters: [new SandboxAdapter()],
    paymentStore: new MemoryPaymentStore(),
    idempotencyStore: new MemoryIdempotencyStore(),
    callbackUrl: () => "https://wallet.bj/hooks",
    onEvent: async (event: PontEvent) => {
      outcomes.push(`${event.type}→${await service!.handleEvent(event)}`);
    },
  });
  service = new WalletService({ engine, wallets, limits, currency: "XOF", withdrawalFee: (amount) => Math.ceil(amount * 0.01) });
  return { engine, wallets, profiles, service, outcomes };
}

async function fundedUser(ctx: ReturnType<typeof setup>, amount = 40_000) {
  await ctx.wallets.open("awa", "XOF");
  ctx.profiles.setTier("awa", "basique");
  const payment = await ctx.service.startDeposit({ userId: "awa", amount, country: "BJ", phone: "+2290100000001", reference: "dep_1" }, "deposit-key-1");
  await ctx.engine.refreshPayment(payment.id);
}

describe("recette Portefeuille mobile", () => {
  it("dépôt : crédité seulement à la confirmation, une seule fois", async () => {
    const ctx = setup();
    await ctx.wallets.open("awa", "XOF");
    ctx.profiles.setTier("awa", "basique");
    const payment = await ctx.service.startDeposit({ userId: "awa", amount: 40_000, country: "BJ", phone: "+2290100000001", reference: "dep_1" }, "deposit-key-1");
    expect((await ctx.wallets.balance("awa", "XOF")).available).toBe(0);
    await ctx.engine.refreshPayment(payment.id);
    await ctx.engine.refreshPayment(payment.id);
    expect((await ctx.wallets.balance("awa", "XOF")).available).toBe(40_000);
    expect(ctx.outcomes).toContain("payment.succeeded→credited");
  });

  it("dépôt échoué (solde insuffisant du client) : rien n'est crédité", async () => {
    const ctx = setup();
    await ctx.wallets.open("awa", "XOF");
    ctx.profiles.setTier("awa", "basique");
    const payment = await ctx.service.startDeposit({ userId: "awa", amount: 10_000, country: "BJ", phone: "+2290100000002", reference: "dep_2" }, "deposit-key-2");
    await ctx.engine.refreshPayment(payment.id);
    expect((await ctx.wallets.balance("awa", "XOF")).available).toBe(0);
  });

  it("dépôt au-delà du plafond refusé avant tout paiement", async () => {
    const ctx = setup();
    await fundedUser(ctx);
    await expect(ctx.service.startDeposit({ userId: "awa", amount: 50_001, country: "BJ", phone: "+2290100000001", reference: "dep_3" }, "deposit-key-3")).rejects.toBeInstanceOf(LimitExceededError);
  });

  it("retrait réussi : bloqué, envoyé, puis soldé avec frais à la confirmation", async () => {
    const ctx = setup();
    await fundedUser(ctx);
    const run = await ctx.service.withdraw({ userId: "awa", amount: 10_000, country: "BJ", operator: "mtn_bj", phone: "+2290100000001", reference: "wd_1" }, "withdraw-key-1");
    expect(run.status).toBe("succeeded");
    // Frais de 1 % (100) ajoutés au montant : 10 100 bloqués.
    expect(await ctx.wallets.balance("awa", "XOF")).toMatchObject({ available: 29_900, held: 10_100 });
    const payoutId = (run.output!.envoyer as { payoutId: string }).payoutId;
    await ctx.engine.refreshPayout(payoutId);
    expect(await ctx.wallets.balance("awa", "XOF")).toMatchObject({ available: 29_900, held: 0 });
    expect(ctx.outcomes).toContain("payout.succeeded→settled");
    // Réconciliation (R-034) : le transit baisse exactement du montant envoyé par l'agrégateur.
    expect(await ctx.wallets.systemBalance("transit", "XOF", "sandbox")).toBe(40_000 - 10_000);
    expect(await ctx.wallets.systemBalance("fees", "XOF")).toBe(100);
  });

  it("retrait refusé par l'opérateur : fonds restitués", async () => {
    const ctx = setup();
    await fundedUser(ctx);
    const run = await ctx.service.withdraw({ userId: "awa", amount: 10_000, country: "BJ", operator: "mtn_bj", phone: "+2290100000008", reference: "wd_2" }, "withdraw-key-2");
    await ctx.engine.refreshPayout((run.output!.envoyer as { payoutId: string }).payoutId);
    expect(await ctx.wallets.balance("awa", "XOF")).toMatchObject({ available: 40_000, held: 0 });
    expect(ctx.outcomes).toContain("payout.failed→released");
  });

  it("agrégateur indisponible à l'envoi : le workflow compense, fonds restitués", async () => {
    const ctx = setup();
    await fundedUser(ctx);
    const run = await ctx.service.withdraw({ userId: "awa", amount: 10_000, country: "BJ", operator: "mtn_bj", phone: "+2290100000006", reference: "wd_3" }, "withdraw-key-3");
    expect(run.status).toBe("compensated");
    expect(await ctx.wallets.balance("awa", "XOF")).toMatchObject({ available: 40_000, held: 0 });
  });

  it("retrait au-delà du solde ou du plafond : refusé sans aucun envoi", async () => {
    const ctx = setup();
    await fundedUser(ctx, 20_000);
    const overBalance = await ctx.service.withdraw({ userId: "awa", amount: 30_000, country: "BJ", operator: "mtn_bj", phone: "+2290100000001", reference: "wd_4" }, "withdraw-key-4");
    expect(overBalance).toMatchObject({ status: "compensated", error: expect.stringMatching(/Solde insuffisant/) });
    const overLimit = await ctx.service.withdraw({ userId: "awa", amount: 60_000, country: "BJ", operator: "mtn_bj", phone: "+2290100000001", reference: "wd_5" }, "withdraw-key-5");
    expect(overLimit.error).toMatch(/limitée à 50 000 XOF/);
    expect(ctx.outcomes.filter((o) => o.startsWith("payout."))).toEqual([]);
  });

  it("compte gelé : retrait refusé", async () => {
    const ctx = setup();
    await fundedUser(ctx);
    ctx.profiles.freeze("awa");
    const run = await ctx.service.withdraw({ userId: "awa", amount: 1_000, country: "BJ", operator: "mtn_bj", phone: "+2290100000001", reference: "wd_6" }, "withdraw-key-6");
    expect(run.error).toMatch(/gelé/);
  });
});

describe("catalogue et installation", () => {
  it("un agent trouve la recette depuis une description libre", () => {
    expect(matchRecipes(RECIPES, "Je veux une appli de porte-monnaie avec recharge et retrait mobile money")[0]?.recipe.id).toBe("wallet");
  });

  it("la recette s'installe avec les modules du framework", async () => {
    const engine = new PontEngine({ adapters: [new SandboxAdapter()], paymentStore: new MemoryPaymentStore(), idempotencyStore: new MemoryIdempotencyStore(), callbackUrl: () => "x" });
    const plan = planRecipe(walletRecipe, [paymentsModule, ledgerModule, walletsModule, limitsModule]);
    expect(plan.missing).toEqual([]);
    const app = await createApp({ modules: plan.modules, config: { ...walletRecipe.config, payments: { engine } } });
    expect(app.modules.map((m) => m.name)).toEqual(["payments", "ledger", "wallets", "limits"]);
  });
});
