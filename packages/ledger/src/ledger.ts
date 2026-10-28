import { createHash, randomUUID } from "node:crypto";
import { PontError, type Currency } from "@pont/core";

// Registre en partie double (R-030, R-031, R-036).

export type NormalBalance = "debit" | "credit";

export interface Account {
  id: string;
  /** Code unique et lisible, ex. `wallet:usr_42:available`, `system:transit:fedapay:XOF`. */
  code: string;
  currency: Currency;
  /** Sens qui augmente le solde : `credit` pour ce que la fintech doit (portefeuilles), `debit` pour ce qu'elle détient (transit). */
  normal: NormalBalance;
  /** Autorise un solde négatif (comptes système uniquement, R-036). */
  allowNegative: boolean;
  createdAt: number;
}

export interface EntryLine {
  accountId: string;
  direction: "debit" | "credit";
  /** Unités entières de la devise, strictement positives. */
  amount: number;
}

export interface Entry {
  id: string;
  idempotencyKey: string;
  /** Empreinte du contenu : même clé + contenu différent = conflit. */
  fingerprint: string;
  currency: Currency;
  description: string;
  lines: EntryLine[];
  /** Écriture annulée par celle-ci (correction, R-030). */
  reverses: string | null;
  metadata: Record<string, string>;
  createdAt: number;
}

export interface AccountWithBalance extends Account {
  balance: number;
}

export interface Movement extends EntryLine {
  entryId: string;
  createdAt: number;
}

export type PostResult =
  | { status: "posted"; entry: Entry }
  | { status: "duplicate"; entry: Entry }
  | { status: "insufficient_funds"; accountId: string; balance: number; required: number };

/**
 * Persistance du registre. `post` DOIT être atomique : vérifier l'idempotence, vérifier qu'aucun compte
 * non autorisé ne devient négatif, puis écrire — sans qu'une autre écriture puisse s'intercaler (R-031).
 */
export interface LedgerStore {
  createAccount(account: Account): Promise<Account>;
  getAccount(id: string): Promise<Account | null>;
  getAccountByCode(code: string): Promise<Account | null>;
  post(entry: Entry): Promise<PostResult>;
  getEntry(id: string): Promise<Entry | null>;
  balance(accountId: string): Promise<number>;
  movements(accountId: string, options?: { since?: number; limit?: number }): Promise<Movement[]>;
  /** Comptes dont le code commence par `prefix` (tous si absent), les plus récents d'abord, avec leur solde. */
  listAccounts(options?: { prefix?: string; limit?: number }): Promise<AccountWithBalance[]>;
  /** Écritures les plus récentes d'abord (dashboard, audit). */
  listEntries(limit: number): Promise<Entry[]>;
}

/** Variation du solde d'un compte pour une ligne, selon son sens normal. */
export function signedAmount(account: Pick<Account, "normal">, line: Pick<EntryLine, "direction" | "amount">): number {
  return line.direction === account.normal ? line.amount : -line.amount;
}

export class MemoryLedgerStore implements LedgerStore {
  private readonly accounts = new Map<string, Account>();
  private readonly entries = new Map<string, Entry>();
  private readonly byKey = new Map<string, string>();
  private readonly balances = new Map<string, number>();
  private readonly lines: Movement[] = [];

  async createAccount(account: Account): Promise<Account> {
    const existing = [...this.accounts.values()].find((a) => a.code === account.code);
    if (existing) return existing;
    this.accounts.set(account.id, { ...account });
    this.balances.set(account.id, 0);
    return account;
  }

  async getAccount(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async getAccountByCode(code: string): Promise<Account | null> {
    return [...this.accounts.values()].find((a) => a.code === code) ?? null;
  }

  /** Synchrone de bout en bout : aucune autre écriture ne peut s'intercaler (boucle d'événements). */
  async post(entry: Entry): Promise<PostResult> {
    const existingId = this.byKey.get(entry.idempotencyKey);
    if (existingId) return { status: "duplicate", entry: this.entries.get(existingId)! };
    const next = new Map<string, number>();
    for (const line of entry.lines) {
      const account = this.accounts.get(line.accountId)!;
      const current = next.get(account.id) ?? this.balances.get(account.id) ?? 0;
      next.set(account.id, current + signedAmount(account, line));
    }
    for (const [accountId, balance] of next) {
      const account = this.accounts.get(accountId)!;
      if (!account.allowNegative && balance < 0) {
        return { status: "insufficient_funds", accountId, balance: this.balances.get(accountId) ?? 0, required: (this.balances.get(accountId) ?? 0) - balance };
      }
    }
    for (const [accountId, balance] of next) this.balances.set(accountId, balance);
    this.entries.set(entry.id, entry);
    this.byKey.set(entry.idempotencyKey, entry.id);
    for (const line of entry.lines) this.lines.push({ ...line, entryId: entry.id, createdAt: entry.createdAt });
    return { status: "posted", entry };
  }

  async getEntry(id: string): Promise<Entry | null> {
    return this.entries.get(id) ?? null;
  }

  async balance(accountId: string): Promise<number> {
    return this.balances.get(accountId) ?? 0;
  }

  async listAccounts(options: { prefix?: string; limit?: number } = {}): Promise<AccountWithBalance[]> {
    return [...this.accounts.values()]
      .filter((account) => account.code.startsWith(options.prefix ?? ""))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER)
      .map((account) => ({ ...account, balance: this.balances.get(account.id) ?? 0 }));
  }

  async listEntries(limit: number): Promise<Entry[]> {
    return [...this.entries.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async movements(accountId: string, options: { since?: number; limit?: number } = {}): Promise<Movement[]> {
    return this.lines
      .filter((m) => m.accountId === accountId && m.createdAt >= (options.since ?? 0))
      .slice(-(options.limit ?? Number.MAX_SAFE_INTEGER));
  }
}

export interface PostInput {
  idempotencyKey: string;
  currency: Currency;
  description: string;
  lines: EntryLine[];
  reverses?: string;
  metadata?: Record<string, string>;
}

function fingerprintOf(input: PostInput): string {
  const lines = [...input.lines].sort((a, b) => `${a.accountId}${a.direction}`.localeCompare(`${b.accountId}${b.direction}`));
  return createHash("sha256").update(JSON.stringify({ c: input.currency, l: lines, r: input.reverses ?? null })).digest("hex");
}

/** Service du registre (module `ledger`). */
export class Ledger {
  constructor(private readonly store: LedgerStore, private readonly now: () => number = Date.now) {}

  async openAccount(input: { code: string; currency: Currency; normal: NormalBalance; allowNegative?: boolean }): Promise<Account> {
    const account: Account = {
      id: `acc_${randomUUID().replace(/-/g, "")}`,
      code: input.code,
      currency: input.currency,
      normal: input.normal,
      allowNegative: input.allowNegative ?? false,
      createdAt: this.now(),
    };
    const stored = await this.store.createAccount(account);
    if (stored.currency !== input.currency || stored.normal !== input.normal) {
      throw new PontError("configuration_error", `Le compte « ${input.code} » existe déjà avec une autre devise ou un autre sens.`);
    }
    return stored;
  }

  async account(code: string): Promise<Account> {
    const account = await this.store.getAccountByCode(code);
    if (!account) throw new PontError("payment_not_found", `Compte « ${code} » introuvable.`);
    return account;
  }

  balance(account: Account): Promise<number> {
    return this.store.balance(account.id);
  }

  movements(account: Account, options?: { since?: number; limit?: number }): Promise<Movement[]> {
    return this.store.movements(account.id, options);
  }

  /** Passe une écriture équilibrée (R-030), idempotente, sans découvert sur les comptes protégés (R-031). */
  async post(input: PostInput): Promise<PostResult> {
    if (input.lines.length < 2) throw new PontError("invalid_request", "Une écriture a au moins deux lignes.");
    let debits = 0;
    let credits = 0;
    for (const line of input.lines) {
      if (!Number.isInteger(line.amount) || line.amount <= 0) throw new PontError("invalid_request", "Montants entiers strictement positifs uniquement.");
      const account = await this.store.getAccount(line.accountId);
      if (!account) throw new PontError("invalid_request", `Compte ${line.accountId} inconnu.`);
      if (account.currency !== input.currency) throw new PontError("invalid_request", `Le compte ${account.code} n'est pas en ${input.currency}.`);
      if (line.direction === "debit") debits += line.amount;
      else credits += line.amount;
    }
    if (debits !== credits) throw new PontError("invalid_request", `Écriture déséquilibrée : débits ${debits} ≠ crédits ${credits}.`);

    const fingerprint = fingerprintOf(input);
    const entry: Entry = {
      id: `ent_${randomUUID().replace(/-/g, "")}`,
      idempotencyKey: input.idempotencyKey,
      fingerprint,
      currency: input.currency,
      description: input.description,
      lines: input.lines.map((l) => ({ ...l })),
      reverses: input.reverses ?? null,
      metadata: input.metadata ?? {},
      createdAt: this.now(),
    };
    const result = await this.store.post(entry);
    if (result.status === "duplicate" && result.entry.fingerprint !== fingerprint) {
      throw new PontError("idempotency_conflict", `Clé d'écriture « ${input.idempotencyKey} » déjà utilisée avec un contenu différent.`);
    }
    return result;
  }

  /** Annule une écriture par l'écriture inverse (jamais de suppression, R-030). */
  async reverse(entryId: string, idempotencyKey: string, description: string): Promise<PostResult> {
    const original = await this.store.getEntry(entryId);
    if (!original) throw new PontError("payment_not_found", `Écriture ${entryId} introuvable.`);
    return this.post({
      idempotencyKey,
      currency: original.currency,
      description,
      reverses: original.id,
      lines: original.lines.map((l) => ({ accountId: l.accountId, amount: l.amount, direction: l.direction === "debit" ? "credit" : "debit" })),
    });
  }
}
