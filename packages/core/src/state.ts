import { PontError } from "./errors.js";
import type { PaymentStatus } from "./types.js";

// Machine d'états d'un paiement. Voir docs/metier/regles.md (R-001).
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["pending", "processing", "failed", "cancelled"],
  pending: ["processing", "succeeded", "failed", "expired", "cancelled"],
  processing: ["succeeded", "failed", "expired", "cancelled"],
  succeeded: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded", "partially_refunded"],
  failed: [],
  expired: [],
  cancelled: [],
  refunded: [],
};

export const FINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "succeeded",
  "failed",
  "expired",
  "cancelled",
  "refunded",
]);

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new PontError("invalid_transition", `${from} → ${to}`);
  }
}

export function isFinal(status: PaymentStatus): boolean {
  return FINAL_STATUSES.has(status);
}
