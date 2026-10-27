import { PontError, type Payment, type Payout, type ProviderId, type Refund } from "@pont/core";
import {
  isUnsettled,
  type Delivery,
  type DeliveryStore,
  type IdempotencyRecord,
  type IdempotencyStore,
  type PaymentStore,
  type PayoutStore,
  type RecordStore,
  type RefundStore,
} from "@pont/engine";
import type { WorkflowRun, WorkflowRunStore } from "@pont/framework";

/**
 * Sous-ensemble du client Prisma utilisé par les stores. Le client généré dans le projet du marchand
 * (avec les modèles de `prisma/schema.prisma` fusionnés) le satisfait.
 */
interface Delegate {
  findUnique(args: { where: Record<string, unknown> }): Promise<unknown>;
  findFirst(args: { where: Record<string, unknown> }): Promise<unknown>;
  findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<unknown[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}

export interface PontPrismaClient {
  pontRecord: Delegate;
  pontIdempotency: Delegate;
  pontDelivery: Delegate;
  pontWorkflowRun: Delegate;
}

type Kind = "payment" | "payout" | "refund";
type StoredRecord = Payment | Payout | Refund;

/** Valeur JSON propre (Prisma refuse `undefined`). */
function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function dataOf<T>(row: unknown): T | null {
  if (row === null || row === undefined) return null;
  if (typeof row !== "object" || !("data" in row)) throw new PontError("configuration_error", "Ligne Prisma inattendue.");
  return (row as { data: T }).data;
}

/** Prisma signale une violation d'unicité avec le code P2002. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

class PrismaRecordStore<T extends StoredRecord> implements RecordStore<T> {
  constructor(protected readonly client: PontPrismaClient, private readonly kind: Kind) {}

  async get(id: string): Promise<T | null> {
    return dataOf<T>(await this.client.pontRecord.findUnique({ where: { kind_recordId: { kind: this.kind, recordId: id } } }));
  }

  async findByAttempt(provider: ProviderId, attemptId: string): Promise<T | null> {
    return dataOf<T>(await this.client.pontRecord.findFirst({ where: { kind: this.kind, provider, attemptId } }));
  }

  async findByProviderRef(provider: ProviderId, providerRef: string): Promise<T | null> {
    return dataOf<T>(await this.client.pontRecord.findFirst({ where: { kind: this.kind, provider, providerRef } }));
  }

  async insert(record: T): Promise<void> {
    await this.client.pontRecord.create({ data: { kind: this.kind, recordId: record.id, ...this.columns(record) } });
  }

  async update(record: T): Promise<void> {
    await this.client.pontRecord.update({ where: { kind_recordId: { kind: this.kind, recordId: record.id } }, data: this.columns(record) });
  }

  async listUnsettled(updatedBefore: number, limit: number): Promise<T[]> {
    const rows = await this.client.pontRecord.findMany({
      where: { kind: this.kind, unsettled: true, updatedAt: { lte: BigInt(updatedBefore) } },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map((row) => dataOf<T>(row)!);
  }

  private columns(record: T): Record<string, unknown> {
    return {
      provider: record.provider,
      attemptId: record.attemptId,
      providerRef: record.providerRef,
      paymentId: "paymentId" in record ? record.paymentId : null,
      unsettled: isUnsettled(record),
      updatedAt: BigInt(record.updatedAt),
      data: json(record),
    };
  }
}

export class PrismaPaymentStore extends PrismaRecordStore<Payment> implements PaymentStore {
  constructor(client: PontPrismaClient) {
    super(client, "payment");
  }
}

export class PrismaPayoutStore extends PrismaRecordStore<Payout> implements PayoutStore {
  constructor(client: PontPrismaClient) {
    super(client, "payout");
  }
}

export class PrismaRefundStore extends PrismaRecordStore<Refund> implements RefundStore {
  constructor(client: PontPrismaClient) {
    super(client, "refund");
  }

  async listByPayment(paymentId: string): Promise<Refund[]> {
    const rows = await this.client.pontRecord.findMany({ where: { kind: "refund", paymentId } });
    return rows.map((row) => dataOf<Refund>(row)!);
  }
}

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly client: PontPrismaClient) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    const row = (await this.client.pontIdempotency.findUnique({ where: { key } })) as { fingerprint: string; recordId: string } | null;
    return row ? { fingerprint: row.fingerprint, recordId: row.recordId } : null;
  }

  /** La contrainte d'unicité de Postgres garantit qu'une seule requête concurrente réussit. */
  async putIfAbsent(key: string, record: IdempotencyRecord): Promise<boolean> {
    try {
      await this.client.pontIdempotency.create({ data: { key, ...record } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }
}

export class PrismaDeliveryStore implements DeliveryStore {
  constructor(private readonly client: PontPrismaClient) {}

  async insert(delivery: Delivery): Promise<void> {
    await this.client.pontDelivery.create({ data: { deliveryId: delivery.id, ...this.columns(delivery) } });
  }

  async update(delivery: Delivery): Promise<void> {
    await this.client.pontDelivery.update({ where: { deliveryId: delivery.id }, data: this.columns(delivery) });
  }

  async get(id: string): Promise<Delivery | null> {
    return dataOf<Delivery>(await this.client.pontDelivery.findUnique({ where: { deliveryId: id } }));
  }

  async due(now: number, limit: number): Promise<Delivery[]> {
    const rows = await this.client.pontDelivery.findMany({
      where: { status: "pending", nextAttemptAt: { lte: BigInt(now) } },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
    });
    return rows.map((row) => dataOf<Delivery>(row)!);
  }

  private columns(delivery: Delivery): Record<string, unknown> {
    return { status: delivery.status, nextAttemptAt: delivery.nextAttemptAt === null ? null : BigInt(delivery.nextAttemptAt), data: json(delivery) };
  }
}

const FINAL_RUN = ["succeeded", "compensated", "compensation_failed"];

export class PrismaWorkflowRunStore implements WorkflowRunStore {
  constructor(private readonly client: PontPrismaClient) {}

  async get(workflow: string, idempotencyKey: string): Promise<WorkflowRun | null> {
    return dataOf<WorkflowRun>(await this.client.pontWorkflowRun.findUnique({ where: { workflow_idempotencyKey: { workflow, idempotencyKey } } }));
  }

  async create(run: WorkflowRun): Promise<boolean> {
    try {
      await this.client.pontWorkflowRun.create({ data: { workflow: run.workflow, idempotencyKey: run.idempotencyKey, ...this.columns(run) } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /** Prise de bail atomique : un seul `UPDATE … WHERE lease_until <= now` peut réussir. */
  async acquire(workflow: string, idempotencyKey: string, now: number, leaseUntil: number): Promise<WorkflowRun | null> {
    const result = await this.client.pontWorkflowRun.updateMany({
      where: { workflow, idempotencyKey, status: { notIn: FINAL_RUN }, leaseUntil: { lte: BigInt(now) } },
      data: { leaseUntil: BigInt(leaseUntil) },
    });
    if (result.count !== 1) return null;
    const run = await this.get(workflow, idempotencyKey);
    if (!run) return null;
    run.leaseUntil = leaseUntil;
    run.updatedAt = now;
    return run;
  }

  async save(run: WorkflowRun): Promise<void> {
    await this.client.pontWorkflowRun.update({
      where: { workflow_idempotencyKey: { workflow: run.workflow, idempotencyKey: run.idempotencyKey } },
      data: this.columns(run),
    });
  }

  private columns(run: WorkflowRun): Record<string, unknown> {
    return { status: run.status, leaseUntil: BigInt(run.leaseUntil), data: json(run) };
  }
}

/** Tous les stores Pont sur un même client Prisma. */
export function createPrismaStores(client: PontPrismaClient) {
  return {
    payments: new PrismaPaymentStore(client),
    payouts: new PrismaPayoutStore(client),
    refunds: new PrismaRefundStore(client),
    idempotency: new PrismaIdempotencyStore(client),
    deliveries: new PrismaDeliveryStore(client),
    workflowRuns: new PrismaWorkflowRunStore(client),
  };
}
