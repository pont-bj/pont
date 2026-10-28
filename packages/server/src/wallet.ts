import { z } from "zod";
import { PontError, countrySchema, operatorSchema, type Currency } from "@pont-bj/core";
import type { PontEngine } from "@pont-bj/engine";
import { InsufficientFundsError, Ledger, Limits, Wallets, type Entry, type LedgerStore, type ManagedProfileStore } from "@pont-bj/ledger";
import { LimitExceededError, WalletService, walletRecipe } from "@pont-bj/recipes";
import type { ServerEnv } from "./config.js";
import type { StorageAdapter } from "./storage.js";

/** Tout ce que le serveur sait faire avec les portefeuilles. Absent si le stockage n'a pas de registre. */
export interface WalletKit {
  service: WalletService;
  wallets: Wallets;
  limits: Limits;
  profiles: ManagedProfileStore;
  store: LedgerStore;
  currency: Currency;
  /** Frais de retrait prélevés pour un montant donné. */
  fee: (amount: number) => number;
}

export function createWalletKit(storage: StorageAdapter, env: ServerEnv, engine: PontEngine): WalletKit | null {
  if (!storage.ledger) return null;
  const currency = env.PONT_WALLET_CURRENCY;
  const ledger = new Ledger(storage.ledger.store);
  const wallets = new Wallets(ledger);
  const limitsConfig = env.PONT_LIMITS ? parseJson(env.PONT_LIMITS) : walletRecipe.config.limits;
  const limits = new Limits(limitsConfig, wallets, storage.ledger.profiles);
  const bps = env.PONT_WITHDRAWAL_FEE_BPS;
  const fee = (amount: number) => (bps > 0 ? Math.round((amount * bps) / 10_000) : 0);
  const service = new WalletService({
    engine,
    wallets,
    limits,
    currency,
    ...(storage.workflowRuns ? { workflowStore: storage.workflowRuns } : {}),
    ...(bps > 0 ? { withdrawalFee: fee } : {}),
  });
  return { service, wallets, limits, profiles: storage.ledger.profiles, store: storage.ledger.store, currency, fee };
}

const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Filet de sécurité : si le crédit a échoué après que le paiement soit passé à `succeeded` (base indisponible, arrêt
 * brutal), le webhook rejoué de l'agrégateur ne ré-émet pas d'événement. On rejoue donc les opérations finales
 * récentes ; les écritures sont idempotentes (clé dérivée de l'identifiant), un doublon ne crédite jamais deux fois.
 */
export async function reconcileWallet(kit: WalletKit, storage: Pick<StorageAdapter, "payments" | "payouts">, now = Date.now()): Promise<number> {
  const since = now - RECONCILE_WINDOW_MS;
  let replayed = 0;
  for (const payment of await storage.payments.listRecent(200)) {
    if (payment.updatedAt < since || payment.status !== "succeeded") continue;
    const outcome = await kit.service.handleEvent({ id: `reconcile_${payment.id}`, type: "payment.succeeded", createdAt: now, object: "payment", data: payment });
    if (outcome !== "ignored") replayed += 1;
  }
  for (const payout of await storage.payouts.listRecent(200)) {
    if (payout.updatedAt < since || !["succeeded", "failed", "cancelled"].includes(payout.status)) continue;
    const outcome = await kit.service.handleEvent({ id: `reconcile_${payout.id}`, type: `payout.${payout.status}` as "payout.succeeded", createdAt: now, object: "payout", data: payout });
    if (outcome !== "ignored") replayed += 1;
  }
  return replayed;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new PontError("configuration_error", "PONT_LIMITS n'est pas un JSON valide.");
  }
}

const userId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identifiant utilisateur invalide.");
const reference = z.string().min(1).max(64);

const profileBody = z.object({ tier: z.string().min(1).max(32).optional(), frozen: z.boolean().optional() }).strict();
const depositBody = z
  .object({ amount: z.number().int().positive(), country: countrySchema, phone: z.string().min(6).max(20), operator: operatorSchema.optional(), reference })
  .strict();
const withdrawalBody = z
  .object({ amount: z.number().int().positive(), country: countrySchema, phone: z.string().min(6).max(20), operator: operatorSchema, reference })
  .strict();
const transferBody = z.object({ from: userId, to: userId, amount: z.number().int().positive(), fee: z.number().int().min(0).optional(), reference }).strict();

const json = (body: unknown, status = 200) => Response.json(body, { status });
const invalid = (message: string) => json({ error: { code: "invalid_request", message } }, 400);

export const ledgerUnavailable = () =>
  json({ error: { code: "ledger_unavailable", message: "Le portefeuille et le registre nécessitent PONT_STORE=postgres." } }, 501);

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const raw: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: invalid(parsed.error.issues[0]?.message ?? "Requête invalide.") };
}

/** Les erreurs métier du portefeuille deviennent des 422 exploitables par l'application. */
export function walletError(error: unknown): Response | null {
  if (error instanceof LimitExceededError) return json({ error: { code: "limit_exceeded", limit: error.limitCode, message: error.message } }, 422);
  if (error instanceof InsufficientFundsError) {
    return json({ error: { code: "insufficient_funds", available: error.available, required: error.required, message: error.message } }, 422);
  }
  return null;
}

export interface WalletView {
  userId: string;
  currency: Currency;
  available: number;
  held: number;
  tier: string | null;
  frozen: boolean;
}

async function view(kit: WalletKit, user: string): Promise<WalletView> {
  const balance = await kit.wallets.balance(user, kit.currency);
  return { userId: user, currency: kit.currency, available: balance.available, held: balance.held, tier: await kit.profiles.getTier(user), frozen: await kit.profiles.isFrozen(user) };
}

const idempotency = (request: Request, scope: string, ref: string) => request.headers.get("idempotency-key") ?? `auto:${scope}:${ref}`;

/** Retrait refusé : le workflow a restitué les fonds ; on explique pourquoi à l'application. */
async function withdrawalFailure(kit: WalletKit, user: string, amount: number, run: { status: string; error?: string; steps: Array<{ name: string; status: string }> }): Promise<Response> {
  if (run.status === "compensation_failed") {
    return json({ error: { code: "withdrawal_failed", message: "Le retrait a échoué et la restitution des fonds demande une vérification manuelle." } }, 500);
  }
  const failed = run.steps.find((step) => step.status === "failed")?.name;
  const total = amount + kit.fee(amount);
  if (failed === "verifier-plafonds") {
    const decision = await kit.limits.check({ userId: user, currency: kit.currency, operation: "withdraw", amount: total });
    if (!decision.allowed) throw new LimitExceededError(decision.code, decision.message);
  }
  if (failed === "bloquer-fonds") {
    const balance = await kit.wallets.balance(user, kit.currency);
    throw new InsufficientFundsError(balance.available, total);
  }
  return json({ error: { code: "withdrawal_failed", message: run.error ?? "Retrait refusé par l'agrégateur ; les fonds ont été restitués." } }, 422);
}

/** Routes `/v1/wallets/*` (clé API de l'application). */
export async function walletV1(request: Request, path: string[], kit: WalletKit): Promise<Response | null> {
  const [first, second, third] = path;
  if (first === "transfers" && second === undefined && request.method === "POST") {
    const parsed = await body(request, transferBody);
    if (!parsed.ok) return parsed.response;
    const { from, to, amount, fee, reference: ref } = parsed.data;
    await kit.wallets.open(from, kit.currency);
    await kit.wallets.open(to, kit.currency);
    for (const check of [
      { userId: from, operation: "transfer_out" as const, amount: amount + (fee ?? 0) },
      { userId: to, operation: "transfer_in" as const, amount },
    ]) {
      const decision = await kit.limits.check({ ...check, currency: kit.currency });
      if (!decision.allowed) throw new LimitExceededError(decision.code, decision.message);
    }
    await kit.wallets.transfer({ from, to, currency: kit.currency, amount, ...(fee ? { fee } : {}), transferId: request.headers.get("idempotency-key") ?? ref });
    return json({ from: await view(kit, from), to: await view(kit, to) }, 201);
  }
  if (first === undefined || first === "transfers") return null;

  const user = userId.safeParse(first);
  if (!user.success) return invalid("Identifiant utilisateur invalide.");

  if (second === undefined && request.method === "PUT") {
    const parsed = await body(request, profileBody);
    if (!parsed.ok) return parsed.response;
    await kit.wallets.open(user.data, kit.currency);
    if (parsed.data.tier !== undefined) await kit.profiles.setTier(user.data, parsed.data.tier);
    if (parsed.data.frozen !== undefined) await kit.profiles.setFrozen(user.data, parsed.data.frozen);
    return json(await view(kit, user.data));
  }
  if (second === undefined && request.method === "GET") {
    await kit.wallets.open(user.data, kit.currency);
    return json(await view(kit, user.data));
  }
  if (second === "movements" && request.method === "GET") {
    const account = await kit.store.getAccountByCode(`wallet:${user.data}:${kit.currency}:available`);
    return json({ data: account ? (await kit.store.movements(account.id, { limit: 100 })).reverse() : [] });
  }
  if (second === "deposits" && third === undefined && request.method === "POST") {
    const parsed = await body(request, depositBody);
    if (!parsed.ok) return parsed.response;
    await kit.wallets.open(user.data, kit.currency);
    const { reference: ref, operator, ...rest } = parsed.data;
    const payment = await kit.service.startDeposit({ userId: user.data, ...rest, ...(operator ? { operator } : {}), reference: ref }, idempotency(request, "deposit", ref));
    return json(payment, 201);
  }
  if (second === "withdrawals" && third === undefined && request.method === "POST") {
    const parsed = await body(request, withdrawalBody);
    if (!parsed.ok) return parsed.response;
    await kit.wallets.open(user.data, kit.currency);
    const run = await kit.service.withdraw({ userId: user.data, ...parsed.data }, idempotency(request, "withdraw", parsed.data.reference));
    if (run.status === "succeeded") {
      const sent = run.output?.envoyer as { payoutId?: string } | undefined;
      return json({ id: run.id, status: "succeeded", payoutId: sent?.payoutId ?? null, amount: parsed.data.amount, fee: kit.fee(parsed.data.amount) }, 201);
    }
    return withdrawalFailure(kit, user.data, parsed.data.amount, run);
  }
  return null;
}

interface WalletRow extends WalletView {
  updatedAt: number;
}

const WALLET_CODE = /^wallet:([A-Za-z0-9_-]+):(XOF|XAF):(available|held)$/;

/** Routes `/admin/wallets`, `/admin/ledger` (dashboard). */
export async function walletAdmin(request: Request, url: URL, path: string[], kit: WalletKit): Promise<Response | null> {
  const [first, second, third] = path;
  if (first === "wallets" && second === undefined && request.method === "GET") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
    const accounts = await kit.store.listAccounts({ prefix: "wallet:", limit: limit * 2 });
    const byUser = new Map<string, { available: number; held: number; currency: Currency; createdAt: number }>();
    for (const account of accounts) {
      const match = WALLET_CODE.exec(account.code);
      if (!match) continue;
      const [, user, currency, kind] = match as unknown as [string, string, Currency, "available" | "held"];
      const entry = byUser.get(user) ?? { available: 0, held: 0, currency, createdAt: account.createdAt };
      entry[kind] = account.balance;
      byUser.set(user, entry);
    }
    const rows: WalletRow[] = [];
    for (const [user, entry] of [...byUser].slice(0, limit)) {
      rows.push({ userId: user, currency: entry.currency, available: entry.available, held: entry.held, tier: await kit.profiles.getTier(user), frozen: await kit.profiles.isFrozen(user), updatedAt: entry.createdAt });
    }
    return json({ data: rows });
  }
  if (first === "wallets" && second !== undefined && third === undefined && request.method === "GET") {
    const user = userId.safeParse(second);
    if (!user.success) return invalid("Identifiant utilisateur invalide.");
    const account = await kit.store.getAccountByCode(`wallet:${user.data}:${kit.currency}:available`);
    if (!account) return json({ error: { code: "not_found", message: "Portefeuille introuvable." } }, 404);
    return json({ wallet: await view(kit, user.data), movements: (await kit.store.movements(account.id, { limit: 50 })).reverse() });
  }
  if (first === "wallets" && second !== undefined && third === "freeze" && request.method === "POST") {
    const user = userId.safeParse(second);
    const parsed = await body(request, z.object({ frozen: z.boolean() }).strict());
    if (!user.success) return invalid("Identifiant utilisateur invalide.");
    if (!parsed.ok) return parsed.response;
    await kit.profiles.setFrozen(user.data, parsed.data.frozen);
    return json(await view(kit, user.data));
  }
  if (first === "ledger" && second === undefined && request.method === "GET") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
    const [entries, accounts] = await Promise.all([kit.store.listEntries(limit), kit.store.listAccounts({ limit: 2000 })]);
    const codes = new Map(accounts.map((account) => [account.id, account.code]));
    return json({
      currency: kit.currency,
      system: accounts.filter((account) => account.code.startsWith("system:")).map((account) => ({ code: account.code, balance: account.balance, currency: account.currency })),
      entries: entries.map((entry: Entry) => ({
        id: entry.id,
        description: entry.description,
        createdAt: entry.createdAt,
        reverses: entry.reverses,
        lines: entry.lines.map((line) => ({ account: codes.get(line.accountId) ?? line.accountId, direction: line.direction, amount: line.amount })),
      })),
    });
  }
  return null;
}
