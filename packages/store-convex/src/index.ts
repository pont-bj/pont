import { makeFunctionReference } from "convex/server";
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

/** Sous-ensemble de `ConvexHttpClient` (et de `convex-test`) utilisé par les stores. */
export interface ConvexRunner {
  query(reference: never, args: Record<string, unknown>): Promise<unknown>;
  mutation(reference: never, args: Record<string, unknown>): Promise<unknown>;
}

export interface ConvexStoreOptions {
  /** Client Convex : `new ConvexHttpClient(process.env.CONVEX_URL)`. */
  client: ConvexRunner;
  /** Secret partagé, identique à `PONT_STORE_SECRET` dans le déploiement Convex. */
  secret: string;
  /** Chemin du module dans le dossier `convex/` du marchand. Par défaut `pontStore`. */
  module?: string;
}

type Kind = "payment" | "payout" | "refund";
type StoredRecord = Payment | Payout | Refund;

class ConvexCaller {
  constructor(private readonly options: ConvexStoreOptions) {
    if (options.secret.length < 32) throw new PontError("configuration_error", "PONT_STORE_SECRET doit faire au moins 32 caractères.");
  }

  query(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.options.client.query(this.ref(name, "query"), { ...args, secret: this.options.secret });
  }

  mutation(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.options.client.mutation(this.ref(name, "mutation"), { ...args, secret: this.options.secret });
  }

  private ref(name: string, type: "query" | "mutation"): never {
    return makeFunctionReference<typeof type>(`${this.options.module ?? "pontStore"}:${name}`) as never;
  }
}

function parse<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new PontError("configuration_error", "Réponse Convex inattendue.");
  return JSON.parse(value) as T;
}

function parseList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new PontError("configuration_error", "Réponse Convex inattendue.");
  return value.map((item) => parse<T>(item)).filter((item): item is T => item !== null);
}

class ConvexRecordStore<T extends StoredRecord> implements RecordStore<T> {
  protected readonly caller: ConvexCaller;

  constructor(options: ConvexStoreOptions, private readonly kind: Kind) {
    this.caller = new ConvexCaller(options);
  }

  async get(id: string): Promise<T | null> {
    return parse<T>(await this.caller.query("recordGet", { kind: this.kind, recordId: id }));
  }

  async findByAttempt(provider: ProviderId, attemptId: string): Promise<T | null> {
    return parse<T>(await this.caller.query("recordFindByAttempt", { kind: this.kind, provider, attemptId }));
  }

  async findByProviderRef(provider: ProviderId, providerRef: string): Promise<T | null> {
    return parse<T>(await this.caller.query("recordFindByProviderRef", { kind: this.kind, provider, providerRef }));
  }

  async insert(record: T): Promise<void> {
    await this.caller.mutation("recordInsert", this.row(record));
  }

  async update(record: T): Promise<void> {
    await this.caller.mutation("recordUpdate", this.row(record));
  }

  async listUnsettled(updatedBefore: number, limit: number): Promise<T[]> {
    return parseList<T>(await this.caller.query("recordListUnsettled", { kind: this.kind, updatedBefore, limit }));
  }

  private row(record: T): Record<string, unknown> {
    return {
      kind: this.kind,
      recordId: record.id,
      provider: record.provider,
      attemptId: record.attemptId,
      ...(record.providerRef ? { providerRef: record.providerRef } : {}),
      ...("paymentId" in record ? { paymentId: record.paymentId } : {}),
      unsettled: isUnsettled(record),
      updatedAt: record.updatedAt,
      data: JSON.stringify(record),
    };
  }
}

export class ConvexPaymentStore extends ConvexRecordStore<Payment> implements PaymentStore {
  constructor(options: ConvexStoreOptions) {
    super(options, "payment");
  }
}

export class ConvexPayoutStore extends ConvexRecordStore<Payout> implements PayoutStore {
  constructor(options: ConvexStoreOptions) {
    super(options, "payout");
  }
}

export class ConvexRefundStore extends ConvexRecordStore<Refund> implements RefundStore {
  constructor(options: ConvexStoreOptions) {
    super(options, "refund");
  }

  async listByPayment(paymentId: string): Promise<Refund[]> {
    return parseList<Refund>(await this.caller.query("refundListByPayment", { paymentId }));
  }
}

export class ConvexIdempotencyStore implements IdempotencyStore {
  private readonly caller: ConvexCaller;

  constructor(options: ConvexStoreOptions) {
    this.caller = new ConvexCaller(options);
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const row = await this.caller.query("idempotencyGet", { key });
    if (row === null) return null;
    const { fingerprint, recordId } = row as { fingerprint: unknown; recordId: unknown };
    if (typeof fingerprint !== "string" || typeof recordId !== "string") throw new PontError("configuration_error", "Réponse Convex inattendue.");
    return { fingerprint, recordId };
  }

  async putIfAbsent(key: string, record: IdempotencyRecord): Promise<boolean> {
    return (await this.caller.mutation("idempotencyPutIfAbsent", { key, ...record })) === true;
  }
}

export class ConvexDeliveryStore implements DeliveryStore {
  private readonly caller: ConvexCaller;

  constructor(options: ConvexStoreOptions) {
    this.caller = new ConvexCaller(options);
  }

  async insert(delivery: Delivery): Promise<void> {
    await this.caller.mutation("deliveryInsert", this.row(delivery));
  }

  async update(delivery: Delivery): Promise<void> {
    await this.caller.mutation("deliveryUpdate", this.row(delivery));
  }

  async get(id: string): Promise<Delivery | null> {
    return parse<Delivery>(await this.caller.query("deliveryGet", { deliveryId: id }));
  }

  async due(now: number, limit: number): Promise<Delivery[]> {
    return parseList<Delivery>(await this.caller.query("deliveryDue", { now, limit }));
  }

  private row(delivery: Delivery): Record<string, unknown> {
    return {
      deliveryId: delivery.id,
      status: delivery.status,
      ...(delivery.nextAttemptAt !== null ? { nextAttemptAt: delivery.nextAttemptAt } : {}),
      data: JSON.stringify(delivery),
    };
  }
}

/** Tous les stores Pont sur un même déploiement Convex. */
export function createConvexStores(options: ConvexStoreOptions) {
  return {
    payments: new ConvexPaymentStore(options),
    payouts: new ConvexPayoutStore(options),
    refunds: new ConvexRefundStore(options),
    idempotency: new ConvexIdempotencyStore(options),
    deliveries: new ConvexDeliveryStore(options),
  };
}
