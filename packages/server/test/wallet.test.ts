import { describe, expect, it } from "vitest";
import { createPontFromEnv } from "@pont/node";
import { createRuntime } from "../src/runtime.js";
import { memoryStorage, type StorageFactory } from "../src/storage.js";
import { createWalletKit, reconcileWallet } from "../src/wallet.js";
import { parseServerEnv } from "../src/config.js";

const API_KEY = "a".repeat(32);
const ADMIN = "b".repeat(32);
const BASE = { PONT_MODE: "test", PONT_SANDBOX: "true", PONT_PUBLIC_URL: "https://pont.exemple.bj", PONT_API_KEY: API_KEY, PONT_ADMIN_TOKEN: ADMIN };

type Runtime = Awaited<ReturnType<typeof createRuntime>>;

async function setup(extra: Record<string, string> = {}, storage?: StorageFactory) {
  const rt = await createRuntime({ ...BASE, ...extra }, storage ? { storage } : {});
  const call = async (path: string, init: { method?: string; body?: unknown; token?: string; idem?: string } = {}) => {
    const headers = new Headers({ authorization: `Bearer ${init.token ?? API_KEY}` });
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (init.idem) headers.set("idempotency-key", init.idem);
    const response = await rt.handle(new Request(`http://pont.test${path}`, { method: init.method ?? "GET", headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }));
    return { status: response.status, json: (await response.json()) as Record<string, any> };
  };
  return { rt, call };
}

const DEPOSIT = (reference: string, amount = 10_000) => ({ amount, country: "BJ", phone: "+2290100000001", reference });
const WITHDRAWAL = (reference: string, amount: number) => ({ amount, country: "BJ", operator: "mtn_bj", phone: "+2290100000001", reference });

/** Dépôt de bout en bout : paiement créé, confirmé, crédité par l'événement. */
async function fund(call: Awaited<ReturnType<typeof setup>>["call"], user: string, amount: number, reference: string) {
  const deposit = await call(`/v1/wallets/${user}/deposits`, { method: "POST", body: DEPOSIT(reference, amount) });
  expect(deposit.status).toBe(201);
  await call(`/v1/payments/${deposit.json.id}/refresh`, { method: "POST" });
  return deposit.json.id as string;
}

describe("portefeuilles via l'API", () => {
  it("ouvre un portefeuille avec son palier KYC", async () => {
    const { call } = await setup();
    const opened = await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    expect(opened.status).toBe(200);
    expect(opened.json).toMatchObject({ userId: "awa", currency: "XOF", available: 0, held: 0, tier: "basique", frozen: false });
  });

  it("crédite un dépôt confirmé, une seule fois même si l'événement est rejoué", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    const paymentId = await fund(call, "awa", 10_000, "dep-1");
    expect((await call("/v1/wallets/awa")).json.available).toBe(10_000);
    await call(`/v1/payments/${paymentId}/refresh`, { method: "POST" });
    await call(`/v1/payments/${paymentId}/refresh`, { method: "POST" });
    expect((await call("/v1/wallets/awa")).json.available).toBe(10_000);
  });

  it("refuse un dépôt au-dessus du plafond du palier, ou sans palier", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    const trop = await call("/v1/wallets/awa/deposits", { method: "POST", body: DEPOSIT("dep-gros", 60_000) });
    expect(trop.status).toBe(422);
    expect(trop.json.error).toMatchObject({ code: "limit_exceeded", limit: "max_single" });
    const sansPalier = await call("/v1/wallets/koffi/deposits", { method: "POST", body: DEPOSIT("dep-k") });
    expect(sansPalier.json.error).toMatchObject({ code: "limit_exceeded", limit: "unknown_tier" });
  });

  it("retire : fonds bloqués, puis soldés à la confirmation du retrait", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 20_000, "dep-2");
    const withdrawal = await call("/v1/wallets/awa/withdrawals", { method: "POST", body: WITHDRAWAL("wd-1", 5_000) });
    expect(withdrawal.status).toBe(201);
    const afterHold = (await call("/v1/wallets/awa")).json;
    expect(afterHold.available + afterHold.held).toBe(20_000);
    const payoutId = withdrawal.json.payoutId as string;
    expect(payoutId).toMatch(/^po/);
    await call(`/v1/payouts/${payoutId}/refresh`, { method: "POST" });
    expect((await call("/v1/wallets/awa")).json).toMatchObject({ available: 15_000, held: 0 });
  });

  it("applique les frais de retrait configurés", async () => {
    const { call } = await setup({ PONT_WITHDRAWAL_FEE_BPS: "200" });
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 20_000, "dep-3");
    const withdrawal = await call("/v1/wallets/awa/withdrawals", { method: "POST", body: WITHDRAWAL("wd-fee", 5_000) });
    await call(`/v1/payouts/${withdrawal.json.payoutId}/refresh`, { method: "POST" });
    // 5 000 envoyés + 2 % de frais (100) prélevés.
    expect((await call("/v1/wallets/awa")).json).toMatchObject({ available: 14_900, held: 0 });
  });

  it("restitue les fonds quand l'agrégateur refuse le retrait", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 20_000, "dep-7b");
    const withdrawal = await call("/v1/wallets/awa/withdrawals", { method: "POST", body: { ...WITHDRAWAL("wd-refuse", 5_000), phone: "+2290100000008" } });
    const heldOrRefused = (await call("/v1/wallets/awa")).json;
    if (withdrawal.status === 201) {
      await call(`/v1/payouts/${withdrawal.json.payoutId}/refresh`, { method: "POST" });
    }
    const final = (await call("/v1/wallets/awa")).json;
    expect(heldOrRefused.available + heldOrRefused.held).toBe(20_000);
    expect(final).toMatchObject({ available: 20_000, held: 0 });
  });

  it("refuse un retrait supérieur au solde sans rien débiter", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 1_000, "dep-4");
    const refused = await call("/v1/wallets/awa/withdrawals", { method: "POST", body: WITHDRAWAL("wd-trop", 5_000) });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toMatchObject({ code: "insufficient_funds", available: 1_000, required: 5_000 });
    expect((await call("/v1/wallets/awa")).json).toMatchObject({ available: 1_000, held: 0 });
  });

  it("transfère entre utilisateurs et refuse un solde insuffisant", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await call("/v1/wallets/koffi", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 10_000, "dep-5");
    const ok = await call("/v1/wallets/transfers", { method: "POST", body: { from: "awa", to: "koffi", amount: 4_000, reference: "tr-1" } });
    expect(ok.status).toBe(201);
    expect(ok.json.from.available).toBe(6_000);
    expect(ok.json.to.available).toBe(4_000);
    const again = await call("/v1/wallets/transfers", { method: "POST", body: { from: "awa", to: "koffi", amount: 4_000, reference: "tr-1" } });
    expect(again.status).toBe(201);
    expect((await call("/v1/wallets/koffi")).json.available).toBe(4_000);
    const broke = await call("/v1/wallets/transfers", { method: "POST", body: { from: "awa", to: "koffi", amount: 9_000, reference: "tr-2" } });
    expect(broke.status).toBe(422);
    expect(broke.json.error.code).toBe("insufficient_funds");
  });

  it("un compte gelé ne peut plus rien sortir", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 10_000, "dep-6");
    const frozen = await call("/admin/wallets/awa/freeze", { method: "POST", token: ADMIN, body: { frozen: true } });
    expect(frozen.json.frozen).toBe(true);
    const refused = await call("/v1/wallets/awa/withdrawals", { method: "POST", body: WITHDRAWAL("wd-gel", 1_000) });
    expect(refused.json.error).toMatchObject({ code: "limit_exceeded", limit: "frozen" });
    await call("/admin/wallets/awa/freeze", { method: "POST", token: ADMIN, body: { frozen: false } });
    expect((await call("/v1/wallets/awa/withdrawals", { method: "POST", body: WITHDRAWAL("wd-gel-2", 1_000) })).status).toBe(201);
  });

  it("valide les entrées : identifiant, montant et champs inconnus", async () => {
    const { call } = await setup();
    expect((await call("/v1/wallets/a%20b", { method: "PUT", body: {} })).status).toBe(400);
    expect((await call("/v1/wallets/awa/deposits", { method: "POST", body: { ...DEPOSIT("x"), amount: -5 } })).status).toBe(400);
    expect((await call("/v1/wallets/awa", { method: "PUT", body: { solde: 1_000_000 } })).status).toBe(400);
  });

  it("n'accepte pas le jeton admin sur /v1/wallets", async () => {
    const { call } = await setup();
    expect((await call("/v1/wallets/awa", { token: ADMIN })).status).toBe(401);
  });
});

describe("dashboard : portefeuilles et registre", () => {
  it("liste les portefeuilles et le registre avec les comptes système", async () => {
    const { call } = await setup();
    await call("/v1/wallets/awa", { method: "PUT", body: { tier: "basique" } });
    await fund(call, "awa", 10_000, "dep-7");
    const wallets = await call("/admin/wallets", { token: ADMIN });
    expect(wallets.json.data).toEqual([expect.objectContaining({ userId: "awa", available: 10_000, held: 0, tier: "basique", frozen: false })]);
    const detail = await call("/admin/wallets/awa", { token: ADMIN });
    expect(detail.json.wallet.available).toBe(10_000);
    expect(detail.json.movements).toHaveLength(1);
    const ledger = await call("/admin/ledger", { token: ADMIN });
    expect(ledger.json.system).toEqual([expect.objectContaining({ code: "system:transit:sandbox:XOF", balance: 10_000 })]);
    const [entry] = ledger.json.entries;
    expect(entry.lines.map((line: { account: string }) => line.account).sort()).toEqual(["system:transit:sandbox:XOF", "wallet:awa:XOF:available"]);
  });

  it("l'aperçu indique si le portefeuille est disponible", async () => {
    const { call } = await setup();
    expect((await call("/admin/overview", { token: ADMIN })).json.features).toEqual({ wallet: true });
  });

  it("répond 501 quand le stockage n'a pas de registre", async () => {
    const sansRegistre: StorageFactory = async (env) => {
      const { ledger: _ledger, ...storage } = await memoryStorage(env);
      return storage;
    };
    const { call } = await setup({}, sansRegistre);
    expect((await call("/v1/wallets/awa")).status).toBe(501);
    expect((await call("/admin/wallets", { token: ADMIN })).json.error.code).toBe("ledger_unavailable");
    expect((await call("/admin/overview", { token: ADMIN })).json.features).toEqual({ wallet: false });
  });
});

describe("rattrapage des crédits", () => {
  it("crédite un dépôt confirmé dont l'événement a été perdu, sans jamais doubler", async () => {
    const env = parseServerEnv(BASE);
    const storage = await memoryStorage(env);
    // Moteur SANS rappel d'événement : simule un crash entre la confirmation et le crédit.
    const engine = createPontFromEnv({ env: { ...BASE, PONT_HOOKS_PATH: "/hooks" }, stores: storage });
    const kit = createWalletKit(storage, env, engine)!;
    await kit.profiles.setTier("awa", "basique");
    await kit.wallets.open("awa", "XOF");
    const payment = await kit.service.startDeposit({ userId: "awa", amount: 8_000, country: "BJ", phone: "+2290100000001", reference: "perdu" }, "idem-perdu-001");
    await engine.refreshPayment(payment.id);
    expect((await kit.wallets.balance("awa", "XOF")).available).toBe(0);
    expect(await reconcileWallet(kit, storage)).toBe(1);
    expect((await kit.wallets.balance("awa", "XOF")).available).toBe(8_000);
    await reconcileWallet(kit, storage);
    await reconcileWallet(kit, storage);
    expect((await kit.wallets.balance("awa", "XOF")).available).toBe(8_000);
  });

  it("ignore les paiements qui ne viennent pas d'un portefeuille", async () => {
    const env = parseServerEnv(BASE);
    const storage = await memoryStorage(env);
    const engine = createPontFromEnv({ env: { ...BASE, PONT_HOOKS_PATH: "/hooks" }, stores: storage });
    const kit = createWalletKit(storage, env, engine)!;
    const payment = await engine.createPayment({ amount: 3_000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "boutique" }, "idem-boutique-1");
    await engine.refreshPayment(payment.id);
    expect(await reconcileWallet(kit, storage)).toBe(0);
  });
});

void (null as unknown as Runtime);
