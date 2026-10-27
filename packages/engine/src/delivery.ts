import { PONT_SIGNATURE_HEADER, signPontWebhook, type Payment, type Payout, type Refund } from "@pont/core";
import type { PontEvent } from "./engine.js";

export interface WebhookDelivery {
  body: string;
  headers: Record<string, string>;
}

/** Données exposées au marchand : jamais d'identifiant interne de tentative ni d'action client. */
function publicData(event: PontEvent): Record<string, unknown> {
  switch (event.object) {
    case "payment": {
      const p: Payment = event.data;
      return {
        id: p.id, status: p.status, amount: p.amount, currency: p.currency, country: p.country, provider: p.provider,
        operator: p.operator, reference: p.reference, failure_code: p.failureCode, needs_reconciliation: p.needsReconciliation, metadata: p.metadata,
      };
    }
    case "payout": {
      const p: Payout = event.data;
      return {
        id: p.id, status: p.status, amount: p.amount, currency: p.currency, country: p.country, provider: p.provider,
        operator: p.operator, reference: p.reference, failure_code: p.failureCode, needs_reconciliation: p.needsReconciliation, metadata: p.metadata,
      };
    }
    case "refund": {
      const r: Refund = event.data;
      return {
        id: r.id, payment_id: r.paymentId, status: r.status, amount: r.amount, currency: r.currency, provider: r.provider,
        failure_code: r.failureCode, needs_reconciliation: r.needsReconciliation,
      };
    }
  }
}

export function serializeEvent(event: PontEvent): string {
  return JSON.stringify({ id: event.id, type: event.type, object: event.object, created_at: event.createdAt, data: publicData(event) });
}

/** Prépare un webhook sortant signé (`Pont-Signature: t=…,v1=…`). */
export function buildWebhookDelivery(secret: string, event: PontEvent, timestamp?: number): WebhookDelivery {
  return signedDelivery(secret, serializeEvent(event), event.id, timestamp);
}

export function signedDelivery(secret: string, body: string, eventId: string, timestamp?: number): WebhookDelivery {
  return {
    body,
    headers: {
      "content-type": "application/json",
      [PONT_SIGNATURE_HEADER]: signPontWebhook(secret, body, timestamp),
      "pont-event-id": eventId,
    },
  };
}
