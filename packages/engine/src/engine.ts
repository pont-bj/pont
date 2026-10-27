import { createHash, randomUUID } from "node:crypto";
import {
  PontError,
  canTransition,
  createPaymentSchema,
  createPayoutSchema,
  createRefundSchema,
  idempotencyKeySchema,
  isFinal,
  normalizePhone,
  type Capability,
  type Country,
  type CreatePaymentInput,
  type CreatePayoutInput,
  type Mode,
  type Operator,
  type Payment,
  type PaymentStatus,
  type Payout,
  type ProviderAdapter,
  type ProviderCallOutcome,
  type ProviderId,
  type Refund,
  type TransferAccepted,
  type TransferStatus,
  type TransferVerified,
  type VerifiedState,
  type WebhookContext,
} from "@pont/core";
import {
  MemoryPayoutStore,
  MemoryRefundStore,
  type IdempotencyStore,
  type PaymentStore,
  type PayoutStore,
  type RefundStore,
} from "./store.js";

export type PontEventType =
  | "payment.pending"
  | "payment.processing"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.expired"
  | "payment.cancelled"
  | "payment.refunded"
  | "payment.partially_refunded"
  | "payment.needs_reconciliation"
  | "payout.pending"
  | "payout.processing"
  | "payout.succeeded"
  | "payout.failed"
  | "payout.cancelled"
  | "payout.needs_reconciliation"
  | "refund.pending"
  | "refund.processing"
  | "refund.succeeded"
  | "refund.failed"
  | "refund.cancelled"
  | "refund.needs_reconciliation";

export type PontEvent =
  | { id: string; type: PontEventType; createdAt: number; object: "payment"; data: Payment }
  | { id: string; type: PontEventType; createdAt: number; object: "payout"; data: Payout }
  | { id: string; type: PontEventType; createdAt: number; object: "refund"; data: Refund };

export interface ReconcileReport {
  checked: number;
  changed: number;
  errors: number;
}

export interface RoutingRule {
  country?: Country;
  operator?: Operator;
  provider: ProviderId;
}

export interface EngineConfig {
  adapters: ProviderAdapter[];
  paymentStore: PaymentStore;
  payoutStore?: PayoutStore;
  refundStore?: RefundStore;
  idempotencyStore: IdempotencyStore;
  /** URL de réception des webhooks de chaque agrégateur (ex. `https://api.exemple.bj/pont/hooks/fedapay`). */
  callbackUrl: (provider: ProviderId) => string;
  /** Agrégateur préféré par pays / opérateur ; sinon ordre de `adapters`. */
  routing?: RoutingRule[];
  /** Essayer l'agrégateur suivant quand le premier est indisponible avant envoi au client (dépôts uniquement). R-006 */
  failover?: boolean;
  onEvent?: (event: PontEvent) => void | Promise<void>;
  now?: () => number;
  newId?: (prefix: "pay" | "po" | "re") => string;
}

const TRANSFER_TRANSITIONS: Record<TransferStatus, readonly TransferStatus[]> = {
  pending: ["processing", "succeeded", "failed", "cancelled"],
  processing: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const isTransferFinal = (status: TransferStatus): boolean => TRANSFER_TRANSITIONS[status].length === 0;

/** Sérialisation stable pour l'empreinte d'idempotence. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const fingerprintOf = (value: unknown): string => createHash("sha256").update(stableStringify(value)).digest("hex");

function zodMessage(issues: Array<{ path: Array<string | number>; message: string }>): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ; ");
}

/**
 * Moteur d'orchestration. Tourne dans le backend du marchand (ADR-001, option B) :
 * les clés d'agrégateur restent dans ses variables d'environnement.
 */
export class PontEngine {
  readonly mode: Mode;
  private readonly config: EngineConfig;
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();
  private readonly payouts: PayoutStore;
  private readonly refunds: RefundStore;
  private readonly now: () => number;
  private readonly newId: (prefix: "pay" | "po" | "re") => string;

  constructor(config: EngineConfig) {
    if (config.adapters.length === 0) throw new PontError("configuration_error", "Aucun agrégateur configuré.");
    const modes = new Set(config.adapters.map((adapter) => adapter.mode));
    if (modes.size > 1) throw new PontError("configuration_error", "Adaptateurs test et live mélangés.");
    // R-011 : CGU Kkiapay Art. 18, un seul agrégateur chez le marchand.
    if (config.adapters.some((a) => a.id === "kkiapay") && config.adapters.some((a) => a.id !== "kkiapay" && a.id !== "sandbox")) {
      throw new PontError(
        "configuration_error",
        "Les CGU Kkiapay (Art. 18) interdisent d'utiliser un autre agrégateur en même temps.",
        "Retirez Kkiapay ou les autres agrégateurs, ou obtenez un accord écrit de Kkiapay.",
      );
    }
    for (const adapter of config.adapters) {
      if (this.adapters.has(adapter.id)) throw new PontError("configuration_error", `Agrégateur ${adapter.id} configuré deux fois.`);
      this.adapters.set(adapter.id, adapter);
    }
    this.config = config;
    this.mode = config.adapters[0]!.mode;
    this.payouts = config.payoutStore ?? new MemoryPayoutStore();
    this.refunds = config.refundStore ?? new MemoryRefundStore();
    this.now = config.now ?? Date.now;
    this.newId = config.newId ?? ((prefix) => `${prefix}_${randomUUID().replace(/-/g, "")}`);
  }

  // ── Paiements ──────────────────────────────────────────────────────────────

  /** Crée un paiement. Idempotent par `idempotencyKey`. R-004 */
  async createPayment(rawInput: unknown, idempotencyKey: string): Promise<Payment> {
    this.assertIdempotencyKey(idempotencyKey);
    const parsed = createPaymentSchema.safeParse(rawInput);
    if (!parsed.success) throw new PontError("invalid_request", zodMessage(parsed.error.issues));
    const input = {
      ...parsed.data,
      customer: { ...parsed.data.customer, phone: this.phone(parsed.data.customer.phone, parsed.data.country) },
    } as CreatePaymentInput;

    const key = `payment:${idempotencyKey}`;
    const fingerprint = fingerprintOf(input);
    const existing = await this.config.idempotencyStore.get(key);
    if (existing) return this.replay(existing.fingerprint, fingerprint, () => this.getPayment(existing.recordId));

    // Avant de réserver la clé : une erreur ici doit rester rejouable avec la même clé.
    const candidates = this.candidates(input.country, input.operator ?? null, "deposit");
    if (candidates.length === 0) {
      throw new PontError("no_provider_available", `${input.country}${input.operator ? ` / ${input.operator}` : ""}.`);
    }
    const paymentId = this.newId("pay");
    const reserved = await this.reserve(key, fingerprint, paymentId);
    if (reserved) return this.replay(reserved.fingerprint, fingerprint, () => this.getPayment(reserved.recordId));

    for (const [index, adapter] of candidates.entries()) {
      const attemptId = randomUUID();
      const base = this.basePayment(paymentId, input, adapter.id, attemptId);
      let outcome: Awaited<ReturnType<ProviderAdapter["createDeposit"]>>;
      try {
        outcome = await adapter.createDeposit({ input, attemptId, callbackUrl: this.config.callbackUrl(adapter.id) });
      } catch {
        // Exception inattendue de l'adaptateur : on ne sait pas si la demande est partie. R-015
        return this.persistPayment({ ...base, status: "processing", needsReconciliation: true, failureCode: "adapter_error" });
      }
      if (outcome.kind === "ok") {
        return this.persistPayment({ ...base, status: "pending", providerRef: outcome.value.providerRef, nextAction: outcome.value.nextAction });
      }
      if (outcome.kind === "rejected") return this.persistPayment({ ...base, status: "failed", failureCode: outcome.code });
      // R-005 : la demande a pu partir, on ne tente jamais un autre agrégateur.
      if (outcome.kind === "ambiguous") return this.persistPayment({ ...base, status: "processing", needsReconciliation: true });
      const hasNext = index < candidates.length - 1;
      if (!(this.config.failover ?? false) || !hasNext) {
        return this.persistPayment({ ...base, status: "failed", failureCode: "provider_unavailable" });
      }
    }
    throw new PontError("no_provider_available");
  }

  async getPayment(id: string): Promise<Payment> {
    const payment = await this.config.paymentStore.get(id);
    if (!payment) throw new PontError("payment_not_found", id);
    return payment;
  }

  /** Relit le statut chez l'agrégateur. Seul chemin vers `succeeded`. R-001 */
  async refreshPayment(id: string): Promise<Payment> {
    const payment = await this.getPayment(id);
    if (isFinal(payment.status) && !payment.needsReconciliation) return payment;
    if (payment.status === "partially_refunded") return payment;
    const outcome = await this.adapter(payment.provider).verify(payment);
    if (outcome.kind !== "ok") return payment;
    return this.applyVerifiedPayment(payment, outcome.value);
  }

  /**
   * Rattache la transaction issue d'un widget front (Kkiapay) puis vérifie.
   * Refuse une transaction déjà rattachée à un autre paiement (rejeu d'un vrai paiement pour une autre commande).
   */
  async attachProviderRef(paymentId: string, providerRef: string): Promise<Payment> {
    const payment = await this.getPayment(paymentId);
    if (payment.nextAction?.type !== "client_widget") throw new PontError("invalid_request", "Ce paiement n'utilise pas de widget front.");
    if (payment.providerRef && payment.providerRef !== providerRef) {
      throw new PontError("invalid_request", "Une autre transaction est déjà rattachée à ce paiement.");
    }
    const owner = await this.config.paymentStore.findByProviderRef(payment.provider, providerRef);
    if (owner && owner.id !== payment.id) throw new PontError("invalid_request", "Cette transaction est déjà rattachée à un autre paiement.");
    await this.config.paymentStore.update({ ...payment, providerRef, updatedAt: this.now() });
    return this.refreshPayment(payment.id);
  }

  // ── Retraits ───────────────────────────────────────────────────────────────

  /** Envoie de l'argent vers un portefeuille mobile. Pas de failover : le solde est propre à chaque agrégateur. */
  async createPayout(rawInput: unknown, idempotencyKey: string): Promise<Payout> {
    this.assertIdempotencyKey(idempotencyKey);
    const parsed = createPayoutSchema.safeParse(rawInput);
    if (!parsed.success) throw new PontError("invalid_request", zodMessage(parsed.error.issues));
    const input = {
      ...parsed.data,
      recipient: { ...parsed.data.recipient, phone: this.phone(parsed.data.recipient.phone, parsed.data.country) },
    } as CreatePayoutInput;

    const key = `payout:${idempotencyKey}`;
    const fingerprint = fingerprintOf(input);
    const existing = await this.config.idempotencyStore.get(key);
    if (existing) return this.replay(existing.fingerprint, fingerprint, () => this.getPayout(existing.recordId));

    const adapter = this.candidates(input.country, input.operator, "payout").find((a) => a.createPayout);
    if (!adapter?.createPayout) throw new PontError("no_provider_available", `retrait ${input.country} / ${input.operator}.`);
    const payoutId = this.newId("po");
    const reserved = await this.reserve(key, fingerprint, payoutId);
    if (reserved) return this.replay(reserved.fingerprint, fingerprint, () => this.getPayout(reserved.recordId));

    const now = this.now();
    const base: Payout = {
      id: payoutId,
      mode: this.mode,
      status: "pending",
      amount: input.amount,
      currency: input.currency,
      country: input.country,
      operator: input.operator,
      provider: adapter.id,
      attemptId: randomUUID(),
      providerRef: null,
      recipientPhone: input.recipient.phone,
      reference: input.reference,
      failureCode: null,
      needsReconciliation: false,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    const outcome = await this.safeCall(() => adapter.createPayout!({ input, attemptId: base.attemptId, callbackUrl: this.config.callbackUrl(adapter.id) }));
    const payout = { ...base, ...this.transferFromOutcome(outcome) };
    await this.payouts.insert(payout);
    await this.emitTransfer("payout", payout);
    return payout;
  }

  async getPayout(id: string): Promise<Payout> {
    const payout = await this.payouts.get(id);
    if (!payout) throw new PontError("payment_not_found", id);
    return payout;
  }

  async refreshPayout(id: string): Promise<Payout> {
    const payout = await this.getPayout(id);
    const adapter = this.adapter(payout.provider);
    if ((isTransferFinal(payout.status) && !payout.needsReconciliation) || !adapter.verifyPayout) return payout;
    const outcome = await adapter.verifyPayout(payout);
    if (outcome.kind !== "ok") return payout;
    const updated = this.applyVerifiedTransfer(payout, outcome.value);
    if (updated === payout) return payout;
    await this.payouts.update(updated);
    await this.emitTransfer("payout", updated);
    return updated;
  }

  // ── Remboursements ─────────────────────────────────────────────────────────

  /** Rembourse tout ou partie d'un paiement réussi. Le total des remboursements ne dépasse jamais le montant payé. */
  async createRefund(paymentId: string, rawInput: unknown, idempotencyKey: string): Promise<Refund> {
    this.assertIdempotencyKey(idempotencyKey);
    const parsed = createRefundSchema.safeParse(rawInput ?? {});
    if (!parsed.success) throw new PontError("invalid_request", zodMessage(parsed.error.issues));

    const key = `refund:${idempotencyKey}`;
    const fingerprint = fingerprintOf({ paymentId, ...parsed.data });
    const existing = await this.config.idempotencyStore.get(key);
    if (existing) return this.replay(existing.fingerprint, fingerprint, () => this.getRefund(existing.recordId));

    const payment = await this.getPayment(paymentId);
    if (payment.status !== "succeeded" && payment.status !== "partially_refunded") {
      throw new PontError("invalid_request", `Seul un paiement réussi peut être remboursé (statut : ${payment.status}).`);
    }
    const adapter = this.adapter(payment.provider);
    if (!adapter.createRefund || !adapter.supports(payment.country, payment.operator, "refund")) {
      throw new PontError("no_provider_available", `${payment.provider} ne permet pas le remboursement par API.`);
    }
    const committed = (await this.refunds.listByPayment(payment.id))
      .filter((refund) => refund.status !== "failed" && refund.status !== "cancelled")
      .reduce((sum, refund) => sum + refund.amount, 0);
    const remaining = payment.amount - committed;
    const amount = parsed.data.amount ?? remaining;
    if (amount <= 0 || amount > remaining) {
      throw new PontError("invalid_request", `Montant remboursable restant : ${remaining} ${payment.currency}.`);
    }

    const refundId = this.newId("re");
    const reserved = await this.reserve(key, fingerprint, refundId);
    if (reserved) return this.replay(reserved.fingerprint, fingerprint, () => this.getRefund(reserved.recordId));

    const now = this.now();
    const base: Refund = {
      id: refundId,
      mode: this.mode,
      paymentId: payment.id,
      status: "pending",
      amount,
      currency: payment.currency,
      provider: payment.provider,
      attemptId: randomUUID(),
      providerRef: null,
      failureCode: null,
      needsReconciliation: false,
      createdAt: now,
      updatedAt: now,
    };
    const outcome = await this.safeCall(() =>
      adapter.createRefund!({ payment, amount, currency: payment.currency, attemptId: base.attemptId, full: committed === 0 && amount === payment.amount }),
    );
    const refund = { ...base, ...this.transferFromOutcome(outcome) };
    await this.refunds.insert(refund);
    await this.emitTransfer("refund", refund);
    if (refund.status === "succeeded") await this.syncRefundedPayment(payment.id);
    return refund;
  }

  async getRefund(id: string): Promise<Refund> {
    const refund = await this.refunds.get(id);
    if (!refund) throw new PontError("payment_not_found", id);
    return refund;
  }

  async refreshRefund(id: string): Promise<Refund> {
    const refund = await this.getRefund(id);
    const adapter = this.adapter(refund.provider);
    if ((isTransferFinal(refund.status) && !refund.needsReconciliation) || !adapter.verifyRefund) return refund;
    const outcome = await adapter.verifyRefund(refund);
    if (outcome.kind !== "ok") return refund;
    const updated = this.applyVerifiedTransfer(refund, outcome.value);
    if (updated === refund) return refund;
    await this.refunds.update(updated);
    await this.emitTransfer("refund", updated);
    if (updated.status === "succeeded") await this.syncRefundedPayment(updated.paymentId);
    return updated;
  }

  // ── Réconciliation ─────────────────────────────────────────────────────────

  /**
   * Relit chez l'agrégateur les opérations non réglées (webhook perdu, statut ambigu, agrégateur lent).
   * À appeler par un job planifié (ex. toutes les 5 minutes). Une erreur sur une opération n'arrête pas les autres.
   */
  async reconcile(options: { minAgeMs?: number; limit?: number } = {}): Promise<ReconcileReport> {
    const before = this.now() - (options.minAgeMs ?? 60_000);
    const limit = options.limit ?? 100;
    const report: ReconcileReport = { checked: 0, changed: 0, errors: 0 };
    const run = async <T extends { id: string; status: string; needsReconciliation: boolean }>(
      records: T[],
      refresh: (id: string) => Promise<T>,
    ) => {
      for (const record of records) {
        report.checked += 1;
        try {
          const updated = await refresh(record.id);
          if (updated.status !== record.status || updated.needsReconciliation !== record.needsReconciliation) report.changed += 1;
        } catch {
          report.errors += 1;
        }
      }
    };
    await run(await this.config.paymentStore.listUnsettled(before, limit), (id) => this.refreshPayment(id));
    await run(await this.payouts.listUnsettled(before, limit), (id) => this.refreshPayout(id));
    await run(await this.refunds.listUnsettled(before, limit), (id) => this.refreshRefund(id));
    return report;
  }

  // ── Webhooks entrants ──────────────────────────────────────────────────────

  /**
   * Webhook entrant d'un agrégateur. Vérifie l'authenticité, retrouve l'opération, puis relit le statut
   * via l'API (le contenu du webhook n'est jamais une preuve, R-003). Idempotent : un doublon ne change rien.
   */
  async handleProviderWebhook(
    provider: ProviderId,
    headers: Headers,
    rawBody: string,
    context?: WebhookContext,
  ): Promise<{ status: "processed"; object: "payment" | "payout" | "refund"; id: string } | { status: "ignored"; reason: string }> {
    const adapter = this.adapter(provider);
    const check = await adapter.checkWebhook(headers, rawBody, context);
    if (!check.valid) throw new PontError("invalid_signature", provider);
    if (!check.lookup) return { status: "ignored", reason: "aucune référence exploitable" };
    const { kind = "payment", by, value } = check.lookup;
    const store = kind === "payout" ? this.payouts : kind === "refund" ? this.refunds : this.config.paymentStore;
    const record = by === "attemptId" ? await store.findByAttempt(provider, value) : await store.findByProviderRef(provider, value);
    if (!record) return { status: "ignored", reason: "opération inconnue" };
    if (kind === "payout") await this.refreshPayout(record.id);
    else if (kind === "refund") await this.refreshRefund(record.id);
    else await this.refreshPayment(record.id);
    return { status: "processed", object: kind, id: record.id };
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  private assertIdempotencyKey(key: string): void {
    if (!idempotencyKeySchema.safeParse(key).success) {
      throw new PontError("invalid_request", "Idempotency-Key absente ou invalide (8 à 255 caractères).");
    }
  }

  private phone(raw: string, country: Country): string {
    return normalizePhone(raw, country, { allowLegacyBenin: this.mode === "test" }).e164;
  }

  /** Réserve la clé ; renvoie l'enregistrement concurrent si un autre appel l'a prise entre-temps. */
  private async reserve(key: string, fingerprint: string, recordId: string) {
    if (await this.config.idempotencyStore.putIfAbsent(key, { fingerprint, recordId })) return null;
    const raced = await this.config.idempotencyStore.get(key);
    if (!raced) throw new PontError("idempotency_conflict");
    return raced;
  }

  private async replay<T>(stored: string, fingerprint: string, load: () => Promise<T>): Promise<T> {
    if (stored !== fingerprint) throw new PontError("idempotency_conflict");
    return load();
  }

  private candidates(country: Country, operator: Operator | null, capability: Capability): ProviderAdapter[] {
    const capable = [...this.adapters.values()].filter((a) => a.supports(country, operator, capability));
    const preferred = (this.config.routing ?? [])
      .filter((rule) => (!rule.country || rule.country === country) && (!rule.operator || rule.operator === operator))
      .map((rule) => rule.provider);
    const rank = (adapter: ProviderAdapter): number => {
      const position = preferred.indexOf(adapter.id);
      return position === -1 ? Number.MAX_SAFE_INTEGER : position;
    };
    return capable.sort((a, b) => rank(a) - rank(b));
  }

  private async safeCall(call: () => Promise<ProviderCallOutcome<TransferAccepted>>): Promise<ProviderCallOutcome<TransferAccepted>> {
    try {
      return await call();
    } catch {
      return { kind: "ambiguous", reason: "adapter_error" };
    }
  }

  private transferFromOutcome(outcome: ProviderCallOutcome<TransferAccepted>): Pick<Payout, "status" | "providerRef" | "failureCode" | "needsReconciliation"> {
    switch (outcome.kind) {
      case "ok":
        return { status: outcome.value.status, providerRef: outcome.value.providerRef, failureCode: null, needsReconciliation: false };
      case "rejected":
        return { status: "failed", providerRef: null, failureCode: outcome.code, needsReconciliation: false };
      case "unavailable_before_push":
        return { status: "failed", providerRef: null, failureCode: "provider_unavailable", needsReconciliation: false };
      case "ambiguous":
        return { status: "processing", providerRef: null, failureCode: outcome.reason === "adapter_error" ? "adapter_error" : null, needsReconciliation: true };
    }
  }

  private applyVerifiedTransfer<T extends Payout | Refund>(record: T, verified: TransferVerified): T {
    let status = verified.status;
    let failureCode = verified.failureCode;
    let needsReconciliation = false;
    if (status === "succeeded") {
      const amountMismatch = verified.amount !== null && verified.amount !== record.amount;
      const currencyMismatch = verified.currency !== null && verified.currency !== record.currency;
      if (amountMismatch || currencyMismatch) {
        status = "failed";
        failureCode = amountMismatch ? "amount_mismatch" : "currency_mismatch";
        needsReconciliation = true;
      }
    }
    const reconcilingFinal = record.needsReconciliation && isTransferFinal(record.status);
    if (!reconcilingFinal && status !== record.status && !TRANSFER_TRANSITIONS[record.status].includes(status)) return record;
    if (record.needsReconciliation && !isTransferFinal(status)) needsReconciliation = true;
    const changed =
      status !== record.status ||
      needsReconciliation !== record.needsReconciliation ||
      (record.providerRef === null && verified.providerRef !== null);
    if (!changed) return record;
    return {
      ...record,
      status,
      failureCode: status === "succeeded" ? null : failureCode,
      providerRef: record.providerRef ?? verified.providerRef,
      needsReconciliation,
      updatedAt: this.now(),
    };
  }

  /** Met le paiement à `refunded` ou `partially_refunded` selon les remboursements réussis. */
  private async syncRefundedPayment(paymentId: string): Promise<void> {
    const payment = await this.getPayment(paymentId);
    const refunded = (await this.refunds.listByPayment(paymentId))
      .filter((refund) => refund.status === "succeeded")
      .reduce((sum, refund) => sum + refund.amount, 0);
    const status: PaymentStatus = refunded >= payment.amount ? "refunded" : "partially_refunded";
    if (status === payment.status || !canTransition(payment.status, status)) return;
    const updated = { ...payment, status, updatedAt: this.now() };
    await this.config.paymentStore.update(updated);
    await this.emit({ object: "payment", type: `payment.${status}`, data: updated });
  }

  private basePayment(id: string, input: CreatePaymentInput, provider: ProviderId, attemptId: string): Payment {
    const now = this.now();
    return {
      id,
      mode: this.mode,
      status: "created",
      amount: input.amount,
      currency: input.currency,
      country: input.country,
      provider,
      attemptId,
      providerRef: null,
      operator: input.operator ?? null,
      reference: input.reference,
      nextAction: null,
      failureCode: null,
      needsReconciliation: false,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
  }

  private async persistPayment(payment: Payment): Promise<Payment> {
    await this.config.paymentStore.insert(payment);
    await this.emitPayment(payment);
    return payment;
  }

  private async applyVerifiedPayment(payment: Payment, verified: VerifiedState): Promise<Payment> {
    let status = verified.status;
    let failureCode = verified.failureCode;
    let needsReconciliation = false;

    // R-013 : un succès dont le montant, la devise ou la tentative ne correspondent pas n'est jamais accepté.
    if (status === "succeeded") {
      const amountMismatch = verified.amount !== null && verified.amount !== payment.amount;
      const currencyMismatch = verified.currency !== null && verified.currency !== payment.currency;
      const attemptMismatch = verified.attemptRef != null && verified.attemptRef !== payment.attemptId;
      if (amountMismatch || currencyMismatch || attemptMismatch) {
        status = "failed";
        failureCode = amountMismatch ? "amount_mismatch" : currencyMismatch ? "currency_mismatch" : "attempt_mismatch";
        needsReconciliation = true;
      }
    }

    // Un paiement final n'est rouvert que s'il attend une réconciliation.
    const reconcilingFinal = payment.needsReconciliation && isFinal(payment.status);
    if (!reconcilingFinal && !canTransition(payment.status, status)) return payment;
    // Un statut ambigu reste à réconcilier tant que l'agrégateur ne donne pas d'état final.
    if (payment.needsReconciliation && !isFinal(status)) needsReconciliation = true;
    const changed =
      status !== payment.status ||
      needsReconciliation !== payment.needsReconciliation ||
      (payment.providerRef === null && verified.providerRef !== null);
    if (!changed) return payment;

    const updated: Payment = {
      ...payment,
      status,
      failureCode: status === "succeeded" ? null : failureCode,
      providerRef: payment.providerRef ?? verified.providerRef,
      needsReconciliation,
      nextAction: isFinal(status) ? null : payment.nextAction,
      updatedAt: this.now(),
    };
    await this.config.paymentStore.update(updated);
    if (updated.status !== payment.status || updated.needsReconciliation !== payment.needsReconciliation) await this.emitPayment(updated);
    return updated;
  }

  private adapter(id: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new PontError("configuration_error", `Agrégateur ${id} non configuré.`);
    return adapter;
  }

  private async emitPayment(payment: Payment): Promise<void> {
    if (payment.status === "created") return;
    const type = payment.needsReconciliation ? "payment.needs_reconciliation" : (`payment.${payment.status}` as PontEventType);
    await this.emit({ object: "payment", type, data: payment });
  }

  private async emitTransfer(object: "payout" | "refund", record: Payout | Refund): Promise<void> {
    const type = (record.needsReconciliation ? `${object}.needs_reconciliation` : `${object}.${record.status}`) as PontEventType;
    if (object === "payout") await this.emit({ object, type, data: record as Payout });
    else await this.emit({ object, type, data: record as Refund });
  }

  private async emit(event: Omit<PontEvent, "id" | "createdAt">): Promise<void> {
    if (!this.config.onEvent) return;
    await this.config.onEvent({ ...event, id: `evt_${randomUUID().replace(/-/g, "")}`, createdAt: this.now() } as PontEvent);
  }
}
