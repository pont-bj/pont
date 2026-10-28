import type { Account, AccountWithBalance, Entry, LedgerStore, ManagedProfileStore, Movement, PostResult } from "@pont-bj/ledger";
import type { Currency } from "@pont-bj/core";

interface LedgerDelegate {
  findUnique(args: { where: Record<string, unknown> }): Promise<unknown>;
  findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<unknown[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}

interface LedgerTx {
  pontLedgerAccount: LedgerDelegate;
  pontLedgerEntry: LedgerDelegate;
  pontLedgerLine: LedgerDelegate;
}

export interface PontPrismaLedgerClient extends LedgerTx {
  $transaction<R>(fn: (tx: LedgerTx) => Promise<R>): Promise<R>;
}

type AccountRow = { id: string; code: string; currency: string; normal: string; allowNegative: boolean; balance: bigint; createdAt: bigint };
type EntryRow = { id: string; idempotencyKey: string; fingerprint: string; currency: string; description: string; reverses: string | null; metadata: unknown; createdAt: bigint };
type LineRow = { entryId: string; accountId: string; direction: string; amount: bigint; createdAt: bigint };

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    code: row.code,
    currency: row.currency as Currency,
    normal: row.normal === "debit" ? "debit" : "credit",
    allowNegative: row.allowNegative,
    createdAt: Number(row.createdAt),
  };
}

/** Levée dans la transaction pour l'annuler quand un compte protégé deviendrait négatif. */
class InsufficientFunds extends Error {
  constructor(readonly accountId: string, readonly balance: number, readonly required: number) {
    super("insufficient_funds");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

export class PrismaLedgerStore implements LedgerStore {
  constructor(private readonly client: PontPrismaLedgerClient) {}

  async createAccount(account: Account): Promise<Account> {
    try {
      await this.client.pontLedgerAccount.create({
        data: { id: account.id, code: account.code, currency: account.currency, normal: account.normal, allowNegative: account.allowNegative, createdAt: BigInt(account.createdAt) },
      });
      return account;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return (await this.getAccountByCode(account.code))!;
    }
  }

  async getAccount(id: string): Promise<Account | null> {
    const row = (await this.client.pontLedgerAccount.findUnique({ where: { id } })) as AccountRow | null;
    return row ? toAccount(row) : null;
  }

  async getAccountByCode(code: string): Promise<Account | null> {
    const row = (await this.client.pontLedgerAccount.findUnique({ where: { code } })) as AccountRow | null;
    return row ? toAccount(row) : null;
  }

  /**
   * Une transaction : l'écriture (clé unique → idempotence), puis pour chaque compte un `UPDATE` conditionnel.
   * Sur un compte protégé, la diminution n'a lieu que si `balance >= montant` : Postgres verrouille la ligne,
   * deux retraits concurrents ne peuvent pas tous les deux passer (R-031). Comptes traités dans un ordre fixe
   * pour éviter les interblocages.
   */
  async post(entry: Entry): Promise<PostResult> {
    const deltas = new Map<string, number>();
    const accounts = new Map<string, Account>();
    for (const line of entry.lines) {
      const account = accounts.get(line.accountId) ?? (await this.getAccount(line.accountId));
      if (!account) throw new Error(`Compte ${line.accountId} inconnu.`);
      accounts.set(account.id, account);
      const delta = line.direction === account.normal ? line.amount : -line.amount;
      deltas.set(account.id, (deltas.get(account.id) ?? 0) + delta);
    }
    try {
      await this.client.$transaction(async (tx) => {
        await tx.pontLedgerEntry.create({
          data: {
            id: entry.id,
            idempotencyKey: entry.idempotencyKey,
            fingerprint: entry.fingerprint,
            currency: entry.currency,
            description: entry.description,
            reverses: entry.reverses,
            metadata: entry.metadata,
            createdAt: BigInt(entry.createdAt),
          },
        });
        await tx.pontLedgerLine.createMany({
          data: entry.lines.map((line) => ({ entryId: entry.id, accountId: line.accountId, direction: line.direction, amount: BigInt(line.amount), createdAt: BigInt(entry.createdAt) })),
        });
        for (const accountId of [...deltas.keys()].sort()) {
          const delta = deltas.get(accountId)!;
          const account = accounts.get(accountId)!;
          if (delta === 0) continue;
          const guard = delta < 0 && !account.allowNegative ? { balance: { gte: BigInt(-delta) } } : {};
          const updated = await tx.pontLedgerAccount.updateMany({
            where: { id: accountId, ...guard },
            data: { balance: delta < 0 ? { decrement: BigInt(-delta) } : { increment: BigInt(delta) } },
          });
          if (updated.count !== 1) {
            const row = (await tx.pontLedgerAccount.findUnique({ where: { id: accountId } })) as AccountRow;
            throw new InsufficientFunds(accountId, Number(row.balance), -delta);
          }
        }
      });
      return { status: "posted", entry };
    } catch (error) {
      if (error instanceof InsufficientFunds) return { status: "insufficient_funds", accountId: error.accountId, balance: error.balance, required: error.required };
      if (isUniqueViolation(error)) {
        const existing = (await this.client.pontLedgerEntry.findUnique({ where: { idempotencyKey: entry.idempotencyKey } })) as EntryRow | null;
        if (existing) return { status: "duplicate", entry: await this.hydrate(existing) };
      }
      throw error;
    }
  }

  async getEntry(id: string): Promise<Entry | null> {
    const row = (await this.client.pontLedgerEntry.findUnique({ where: { id } })) as EntryRow | null;
    return row ? this.hydrate(row) : null;
  }

  async balance(accountId: string): Promise<number> {
    const row = (await this.client.pontLedgerAccount.findUnique({ where: { id: accountId } })) as AccountRow | null;
    return row ? Number(row.balance) : 0;
  }

  async movements(accountId: string, options: { since?: number; limit?: number } = {}): Promise<Movement[]> {
    const rows = (await this.client.pontLedgerLine.findMany({
      where: { accountId, createdAt: { gte: BigInt(options.since ?? 0) } },
      orderBy: { id: "asc" },
      ...(options.limit ? { take: options.limit } : {}),
    })) as LineRow[];
    return rows.map((row) => ({
      entryId: row.entryId,
      accountId: row.accountId,
      direction: row.direction === "debit" ? "debit" : "credit",
      amount: Number(row.amount),
      createdAt: Number(row.createdAt),
    }));
  }

  async listAccounts(options: { prefix?: string; limit?: number } = {}): Promise<AccountWithBalance[]> {
    const rows = (await this.client.pontLedgerAccount.findMany({
      where: options.prefix ? { code: { startsWith: options.prefix } } : {},
      orderBy: { createdAt: "desc" },
      ...(options.limit ? { take: options.limit } : {}),
    })) as AccountRow[];
    return rows.map((row) => ({ ...toAccount(row), balance: Number(row.balance) }));
  }

  async listEntries(limit: number): Promise<Entry[]> {
    const rows = (await this.client.pontLedgerEntry.findMany({ where: {}, orderBy: { createdAt: "desc" }, take: limit })) as EntryRow[];
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  private async hydrate(row: EntryRow): Promise<Entry> {
    const lines = (await this.client.pontLedgerLine.findMany({ where: { entryId: row.id }, orderBy: { id: "asc" } })) as LineRow[];
    return {
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      fingerprint: row.fingerprint,
      currency: row.currency as Currency,
      description: row.description,
      reverses: row.reverses,
      metadata: (row.metadata ?? {}) as Record<string, string>,
      createdAt: Number(row.createdAt),
      lines: lines.map((l) => ({ accountId: l.accountId, direction: l.direction === "debit" ? "debit" : "credit", amount: Number(l.amount) })),
    };
  }
}

interface ProfileDelegate {
  findUnique(args: { where: Record<string, unknown> }): Promise<unknown>;
  upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<unknown>;
}

export interface PontPrismaProfileClient {
  pontCustomerProfile: ProfileDelegate;
}

type ProfileRow = { userId: string; tier: string | null; frozen: boolean };

/** Palier KYC et gel de compte persistants, lus par `Limits` à chaque opération. */
export class PrismaCustomerProfileStore implements ManagedProfileStore {
  constructor(private readonly client: PontPrismaProfileClient) {}

  async getTier(userId: string): Promise<string | null> {
    return ((await this.row(userId))?.tier ?? null) as string | null;
  }

  async isFrozen(userId: string): Promise<boolean> {
    return (await this.row(userId))?.frozen ?? false;
  }

  async setTier(userId: string, tier: string): Promise<void> {
    await this.client.pontCustomerProfile.upsert({
      where: { userId },
      create: { userId, tier, frozen: false, updatedAt: BigInt(Date.now()) },
      update: { tier, updatedAt: BigInt(Date.now()) },
    });
  }

  async setFrozen(userId: string, frozen: boolean): Promise<void> {
    await this.client.pontCustomerProfile.upsert({
      where: { userId },
      create: { userId, tier: null, frozen, updatedAt: BigInt(Date.now()) },
      update: { frozen, updatedAt: BigInt(Date.now()) },
    });
  }

  private async row(userId: string): Promise<ProfileRow | null> {
    return (await this.client.pontCustomerProfile.findUnique({ where: { userId } })) as ProfileRow | null;
  }
}
