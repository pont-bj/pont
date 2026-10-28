import {
  mutationGeneric,
  queryGeneric,
  type DataModelFromSchemaDefinition,
  type GenericDatabaseReader,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import { v } from "convex/values";
import schema from "./schema";

// Équivalent de `_generated/server`, sans dépendre d'une génération de code dans le projet du marchand.
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;

// Fonctions de stockage Pont. Appelées par le moteur (backend du marchand) via ConvexHttpClient.
// Elles sont publiques au sens Convex : chaque appel exige le secret partagé PONT_STORE_SECRET,
// défini dans les variables d'environnement du déploiement Convex ET du backend.

const kind = v.union(v.literal("payment"), v.literal("payout"), v.literal("refund"));

function assertSecret(secret: string): void {
  // Lecture compatible avec ou sans @types/node dans le projet Convex.
  const expected = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PONT_STORE_SECRET;
  if (!expected || expected.length < 32) throw new Error("PONT_STORE_SECRET absent ou trop court (32 caractères minimum).");
  // Comparaison à longueur et durée constantes (pas de node:crypto dans le runtime Convex par défaut).
  let diff = secret.length ^ expected.length;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ (secret.charCodeAt(i) || 0);
  if (diff !== 0) throw new Error("Accès refusé.");
}

type Db = GenericDatabaseReader<DataModel>;
type Kind = "payment" | "payout" | "refund";

async function recordRow(db: Db, k: Kind, recordId: string) {
  return db
    .query("pontRecords")
    .withIndex("by_record", (q) => q.eq("kind", k).eq("recordId", recordId))
    .unique();
}

const recordFields = {
  recordId: v.string(),
  provider: v.string(),
  attemptId: v.string(),
  providerRef: v.optional(v.string()),
  paymentId: v.optional(v.string()),
  unsettled: v.boolean(),
  updatedAt: v.number(),
  data: v.string(),
};

export const recordGet = query({
  args: { secret: v.string(), kind, recordId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return (await recordRow(ctx.db, args.kind, args.recordId))?.data ?? null;
  },
});

export const recordFindByAttempt = query({
  args: { secret: v.string(), kind, provider: v.string(), attemptId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = (await ctx.db
      .query("pontRecords")
      .withIndex("by_attempt", (q) => q.eq("kind", args.kind).eq("provider", args.provider).eq("attemptId", args.attemptId))
      .first());
    return row?.data ?? null;
  },
});

export const recordFindByProviderRef = query({
  args: { secret: v.string(), kind, provider: v.string(), providerRef: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = (await ctx.db
      .query("pontRecords")
      .withIndex("by_provider_ref", (q) => q.eq("kind", args.kind).eq("provider", args.provider).eq("providerRef", args.providerRef))
      .first());
    return row?.data ?? null;
  },
});

export const recordInsert = mutation({
  args: { secret: v.string(), kind, ...recordFields },
  handler: async (ctx, { secret, ...record }) => {
    assertSecret(secret);
    if (await recordRow(ctx.db, record.kind, record.recordId)) throw new Error(`Enregistrement déjà existant : ${record.recordId}`);
    await ctx.db.insert("pontRecords", record);
  },
});

export const recordUpdate = mutation({
  args: { secret: v.string(), kind, ...recordFields },
  handler: async (ctx, { secret, ...record }) => {
    assertSecret(secret);
    const row = await recordRow(ctx.db, record.kind, record.recordId);
    if (!row) throw new Error(`Enregistrement introuvable : ${record.recordId}`);
    await ctx.db.replace(row._id, record);
  },
});

export const recordListUnsettled = query({
  args: { secret: v.string(), kind, updatedBefore: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = (await ctx.db
      .query("pontRecords")
      .withIndex("by_unsettled", (q) => q.eq("kind", args.kind).eq("unsettled", true).lte("updatedAt", args.updatedBefore))
      .take(Math.min(Math.max(args.limit, 1), 500)));
    return rows.map((row) => row.data);
  },
});

export const recordListRecent = query({
  args: { secret: v.string(), kind, limit: v.number() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = (await ctx.db
      .query("pontRecords")
      .withIndex("by_kind_updated", (q) => q.eq("kind", args.kind))
      .order("desc")
      .take(Math.min(Math.max(args.limit, 1), 200)));
    return rows.map((row) => row.data);
  },
});

export const refundListByPayment = query({
  args: { secret: v.string(), paymentId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = (await ctx.db
      .query("pontRecords")
      .withIndex("by_payment", (q) => q.eq("kind", "refund").eq("paymentId", args.paymentId))
      .collect());
    return rows.map((row) => row.data);
  },
});

export const idempotencyGet = query({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("pontIdempotency").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    return row ? { fingerprint: row.fingerprint, recordId: row.recordId } : null;
  },
});

/** Les mutations Convex sont sérialisables : deux appels concurrents avec la même clé ne peuvent pas réussir tous les deux. */
export const idempotencyPutIfAbsent = mutation({
  args: { secret: v.string(), key: v.string(), fingerprint: v.string(), recordId: v.string() },
  handler: async (ctx, { secret, ...entry }) => {
    assertSecret(secret);
    const existing = await ctx.db.query("pontIdempotency").withIndex("by_key", (q) => q.eq("key", entry.key)).unique();
    if (existing) return false;
    await ctx.db.insert("pontIdempotency", entry);
    return true;
  },
});

const deliveryFields = { deliveryId: v.string(), status: v.string(), nextAttemptAt: v.optional(v.number()), data: v.string() };

async function deliveryRow(db: Db, deliveryId: string) {
  return db.query("pontDeliveries").withIndex("by_delivery", (q) => q.eq("deliveryId", deliveryId)).unique();
}

export const deliveryInsert = mutation({
  args: { secret: v.string(), ...deliveryFields },
  handler: async (ctx, { secret, ...delivery }) => {
    assertSecret(secret);
    await ctx.db.insert("pontDeliveries", delivery);
  },
});

export const deliveryUpdate = mutation({
  args: { secret: v.string(), ...deliveryFields },
  handler: async (ctx, { secret, ...delivery }) => {
    assertSecret(secret);
    const row = await deliveryRow(ctx.db, delivery.deliveryId);
    if (!row) throw new Error(`Livraison introuvable : ${delivery.deliveryId}`);
    await ctx.db.replace(row._id, delivery);
  },
});

export const deliveryGet = query({
  args: { secret: v.string(), deliveryId: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return (await deliveryRow(ctx.db, args.deliveryId))?.data ?? null;
  },
});

export const deliveryDue = query({
  args: { secret: v.string(), now: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = (await ctx.db
      .query("pontDeliveries")
      .withIndex("by_due", (q) => q.eq("status", "pending").lte("nextAttemptAt", args.now))
      .take(Math.min(Math.max(args.limit, 1), 200)));
    return rows.map((row) => row.data);
  },
});

export const deliveryListRecent = query({
  args: { secret: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db.query("pontDeliveries").order("desc").take(Math.min(Math.max(args.limit, 1), 200));
    return rows.map((row) => row.data);
  },
});

// Coffre de secrets : les valeurs arrivent déjà chiffrées (AES-256-GCM) par le serveur Pont.
export const secretGet = query({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return (await ctx.db.query("pontSecrets").withIndex("by_key", (q) => q.eq("key", args.key)).unique())?.value ?? null;
  },
});

export const secretPut = mutation({
  args: { secret: v.string(), key: v.string(), value: v.string(), updatedAt: v.number() },
  handler: async (ctx, { secret, ...entry }) => {
    assertSecret(secret);
    const existing = await ctx.db.query("pontSecrets").withIndex("by_key", (q) => q.eq("key", entry.key)).unique();
    if (existing) await ctx.db.replace(existing._id, entry);
    else await ctx.db.insert("pontSecrets", entry);
  },
});

export const secretDelete = mutation({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await ctx.db.query("pontSecrets").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const secretList = query({
  args: { secret: v.string(), prefix: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("pontSecrets")
      .withIndex("by_key", (q) => q.gte("key", args.prefix).lt("key", `${args.prefix}\uffff`))
      .take(500);
    return rows.map((row) => ({ key: row.key, updatedAt: row.updatedAt }));
  },
});
