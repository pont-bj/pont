import { verifyInstruction, type Instruction, type SignedInstruction, type SignedInstructionPayload } from "@pont/core";
import type { IdempotencyStore, PontEngine, WebhookRelay } from "@pont/engine";

export interface InstructionPolicy {
  /** Types d'instruction acceptés. Par défaut : aucun (le marchand doit les autoriser explicitement). */
  allow: Array<Instruction["type"]>;
  /** Montant maximal d'un remboursement ou d'un retrait déclenché depuis le dashboard. */
  maxAmount: number;
}

export interface InstructionExecutorOptions {
  engine: PontEngine;
  relay?: WebhookRelay;
  /** Clé publique Ed25519 de Pont (PEM). */
  pontPublicKey: string;
  /** Identifiant du compte Pont du marchand. */
  accountId: string;
  policy: InstructionPolicy;
  /** Registre des nonces (usage unique). Persistant en production. */
  nonces: IdempotencyStore;
  now?: () => number;
  /** Journal d'audit local. */
  onAudit?: (entry: { payload: SignedInstructionPayload | null; outcome: string }) => void | Promise<void>;
}

export type InstructionResult =
  | { status: "executed"; type: Instruction["type"]; result: unknown }
  | { status: "refused"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Exécute une instruction signée du dashboard Pont avec les clés du marchand (ADR-001, R-020).
 * Refuse tout ce qui n'est pas explicitement autorisé par la politique du marchand.
 */
export async function executeInstruction(signed: SignedInstruction, options: InstructionExecutorOptions): Promise<InstructionResult> {
  const now = options.now ?? Date.now;
  const refuse = async (reason: string, payload: SignedInstructionPayload | null = null): Promise<InstructionResult> => {
    await options.onAudit?.({ payload, outcome: `refusée : ${reason}` });
    return { status: "refused", reason };
  };

  const check = verifyInstruction(options.pontPublicKey, signed, { accountId: options.accountId, nowMs: now() });
  if (!check.valid) return refuse(check.reason);
  const { payload } = check;
  const { instruction } = payload;

  if (!options.policy.allow.includes(instruction.type)) return refuse(`type non autorisé : ${instruction.type}`, payload);

  if (instruction.type === "payout") {
    const amount = (instruction.payout as { amount?: unknown }).amount;
    if (typeof amount !== "number" || amount > options.policy.maxAmount) return refuse("montant au-delà du plafond", payload);
  }
  if (instruction.type === "refund") {
    const payment = await options.engine.getPayment(instruction.paymentId).catch(() => null);
    if (!payment) return refuse("paiement inconnu", payload);
    if ((instruction.amount ?? payment.amount) > options.policy.maxAmount) return refuse("montant au-delà du plafond", payload);
  }

  // Usage unique : réservé avant exécution ; un rejeu de la même instruction est refusé.
  if (!(await options.nonces.putIfAbsent(`instruction:${payload.id}`, { fingerprint: signed.signature, recordId: payload.id }))) {
    return refuse("instruction déjà utilisée", payload);
  }

  let result: unknown;
  try {
    switch (instruction.type) {
      case "refund":
        result = await options.engine.createRefund(instruction.paymentId, instruction.amount ? { amount: instruction.amount } : {}, `instruction-${payload.id}`);
        break;
      case "payout":
        result = await options.engine.createPayout(instruction.payout, `instruction-${payload.id}`);
        break;
      case "resend_webhook":
        if (!options.relay) return refuse("relais de webhooks non configuré", payload);
        result = await options.relay.resend(instruction.deliveryId);
        break;
    }
  } catch (error) {
    // Le nonce reste consommé : une instruction échouée ne peut pas être rejouée, le dashboard en émet une nouvelle.
    const reason = error instanceof Error ? error.message : String(error);
    await options.onAudit?.({ payload, outcome: `échouée : ${reason}` });
    return { status: "failed", reason };
  }
  await options.onAudit?.({ payload, outcome: "exécutée" });
  return { status: "executed", type: instruction.type, result };
}
