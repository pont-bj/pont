import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Tables Pont. À fusionner dans le schéma Convex du marchand (voir README).
// Les enregistrements sont stockés en JSON (`data`) : les métadonnées libres du marchand ne doivent pas
// heurter les règles de nommage des champs Convex. Les colonnes à côté servent uniquement aux index.
export const pontTables = {
  pontRecords: defineTable({
    kind: v.union(v.literal("payment"), v.literal("payout"), v.literal("refund")),
    recordId: v.string(),
    provider: v.string(),
    attemptId: v.string(),
    providerRef: v.optional(v.string()),
    paymentId: v.optional(v.string()),
    unsettled: v.boolean(),
    updatedAt: v.number(),
    data: v.string(),
  })
    .index("by_record", ["kind", "recordId"])
    .index("by_attempt", ["kind", "provider", "attemptId"])
    .index("by_provider_ref", ["kind", "provider", "providerRef"])
    .index("by_unsettled", ["kind", "unsettled", "updatedAt"])
    .index("by_payment", ["kind", "paymentId"])
    .index("by_kind_updated", ["kind", "updatedAt"]),

  pontIdempotency: defineTable({
    key: v.string(),
    fingerprint: v.string(),
    recordId: v.string(),
  }).index("by_key", ["key"]),

  pontSecrets: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  pontDeliveries: defineTable({
    deliveryId: v.string(),
    status: v.string(),
    nextAttemptAt: v.optional(v.number()),
    data: v.string(),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_due", ["status", "nextAttemptAt"]),
};

export default defineSchema(pontTables);
