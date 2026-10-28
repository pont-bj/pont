import type { Payment, Payout, ProviderId, Refund } from "@pont-bj/core";

interface StoredRecord {
  id: string;
  provider: ProviderId;
  attemptId: string;
  providerRef: string | null;
  status: string;
  needsReconciliation: boolean;
  updatedAt: number;
}

/** Statuts qui n'attendent plus rien de l'agrégateur (paiements et transferts confondus). */
export const SETTLED_STATUSES: ReadonlySet<string> = new Set(["succeeded", "failed", "expired", "cancelled", "refunded", "partially_refunded"]);

export function isUnsettled(record: { status: string; needsReconciliation: boolean }): boolean {
  return record.needsReconciliation || !SETTLED_STATUSES.has(record.status);
}

/** Persistance d'un type d'opération. Implémentation Convex à venir ; mémoire pour les tests et le mode local. */
export interface RecordStore<T extends StoredRecord> {
  get(id: string): Promise<T | null>;
  findByAttempt(provider: ProviderId, attemptId: string): Promise<T | null>;
  findByProviderRef(provider: ProviderId, providerRef: string): Promise<T | null>;
  insert(record: T): Promise<void>;
  update(record: T): Promise<void>;
  /** Opérations non réglées (statut non final ou à réconcilier) dont la dernière mise à jour est antérieure à `updatedBefore`. */
  listUnsettled(updatedBefore: number, limit: number): Promise<T[]>;
  /** Opérations les plus récemment mises à jour d'abord (dashboard, API de consultation). */
  listRecent(limit: number): Promise<T[]>;
}

export type PaymentStore = RecordStore<Payment>;
export type PayoutStore = RecordStore<Payout>;

export interface RefundStore extends RecordStore<Refund> {
  listByPayment(paymentId: string): Promise<Refund[]>;
}

export interface IdempotencyRecord {
  fingerprint: string;
  recordId: string;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  /** Doit échouer (retourner false) si la clé existe déjà, pour résister aux requêtes concurrentes. */
  putIfAbsent(key: string, record: IdempotencyRecord): Promise<boolean>;
}

export class MemoryRecordStore<T extends StoredRecord> implements RecordStore<T> {
  protected readonly records = new Map<string, T>();

  async get(id: string): Promise<T | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async findByAttempt(provider: ProviderId, attemptId: string): Promise<T | null> {
    for (const record of this.records.values()) {
      if (record.provider === provider && record.attemptId === attemptId) return { ...record };
    }
    return null;
  }

  async findByProviderRef(provider: ProviderId, providerRef: string): Promise<T | null> {
    for (const record of this.records.values()) {
      if (record.provider === provider && record.providerRef === providerRef) return { ...record };
    }
    return null;
  }

  async insert(record: T): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async update(record: T): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async listUnsettled(updatedBefore: number, limit: number): Promise<T[]> {
    return [...this.records.values()]
      .filter((record) => isUnsettled(record) && record.updatedAt <= updatedBefore)
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, limit)
      .map((record) => ({ ...record }));
  }

  async listRecent(limit: number): Promise<T[]> {
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((record) => ({ ...record }));
  }
}

export class MemoryPaymentStore extends MemoryRecordStore<Payment> {}
export class MemoryPayoutStore extends MemoryRecordStore<Payout> {}

export class MemoryRefundStore extends MemoryRecordStore<Refund> implements RefundStore {
  async listByPayment(paymentId: string): Promise<Refund[]> {
    return [...this.records.values()].filter((refund) => refund.paymentId === paymentId).map((refund) => ({ ...refund }));
  }
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async putIfAbsent(key: string, record: IdempotencyRecord): Promise<boolean> {
    if (this.records.has(key)) return false;
    this.records.set(key, record);
    return true;
  }
}

/**
 * Coffre de secrets : paires clé/valeur où la valeur est DÉJÀ chiffrée par l'appelant (le store ne voit jamais de clair).
 * Clés : `provider:<agrégateur>` (identifiants d'un agrégateur), `endpoint:<id>` (destinataire de webhook).
 */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Clés commençant par `prefix`, avec leur date de dernière écriture. */
  list(prefix: string): Promise<Array<{ key: string; updatedAt: number }>>;
}

export class MemorySecretStore implements SecretStore {
  private readonly entries = new Map<string, { value: string; updatedAt: number }>();

  async get(key: string): Promise<string | null> {
    return this.entries.get(key)?.value ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.entries.set(key, { value, updatedAt: Date.now() });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async list(prefix: string): Promise<Array<{ key: string; updatedAt: number }>> {
    return [...this.entries].filter(([key]) => key.startsWith(prefix)).map(([key, entry]) => ({ key, updatedAt: entry.updatedAt }));
  }
}
