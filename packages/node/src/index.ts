import { CUSTOM_PROVIDER_ID, PontError, isPontError, safeEqual, verifyPontWebhook, type ProviderAdapter, type ProviderId } from "@pont/core";
import {
  MemoryIdempotencyStore,
  MemoryPaymentStore,
  MemoryPayoutStore,
  MemoryRefundStore,
  PontEngine,
  type EngineConfig,
  type IdempotencyStore,
  type PaymentStore,
  type PayoutStore,
  type PontEvent,
  type RefundStore,
  type WebhookRelay,
} from "@pont/engine";
import { adaptersFromEnv, callbackUrlFor, parseEnv } from "./config.js";

export { parseEnv, adaptersFromEnv, callbackUrlFor, type PontEnv } from "./config.js";
export { executeInstruction, type InstructionPolicy, type InstructionExecutorOptions, type InstructionResult } from "./instructions.js";
export { PontEngine, WebhookRelay, type PontEvent } from "@pont/engine";
export { PontError } from "@pont/core";


export interface CreatePontOptions {
  env?: Record<string, string | undefined>;
  /** Persistance. Par défaut en mémoire : à remplacer en production (Convex, Postgres…). */
  stores?: { payments?: PaymentStore; payouts?: PayoutStore; refunds?: RefundStore; idempotency?: IdempotencyStore };
  routing?: EngineConfig["routing"];
  /** Adaptateurs personnalisés (`pont provider new`), ajoutés à ceux des variables d'environnement. */
  extraAdapters?: ProviderAdapter[];
  onEvent?: (event: PontEvent) => void | Promise<void>;
}

/**
 * Construit le moteur à partir des variables d'environnement.
 *
 * ```ts
 * export const pont = createPontFromEnv({ onEvent: (e) => relay.enqueue(e) });
 * ```
 */
export function createPontFromEnv(options: CreatePontOptions = {}): PontEngine {
  const env = parseEnv(options.env ?? process.env);
  if (env.PONT_MODE === "live" && !options.stores?.payments) {
    throw new PontError("configuration_error", "En live, un stockage persistant est obligatoire (stores.payments).");
  }
  return new PontEngine({
    adapters: [...adaptersFromEnv(env, { allowEmpty: (options.extraAdapters?.length ?? 0) > 0 }), ...(options.extraAdapters ?? [])],
    paymentStore: options.stores?.payments ?? new MemoryPaymentStore(),
    payoutStore: options.stores?.payouts ?? new MemoryPayoutStore(),
    refundStore: options.stores?.refunds ?? new MemoryRefundStore(),
    idempotencyStore: options.stores?.idempotency ?? new MemoryIdempotencyStore(),
    callbackUrl: callbackUrlFor(env),
    failover: env.PONT_FAILOVER === "true",
    ...(options.routing ? { routing: options.routing } : {}),
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });
}

/**
 * Traite un webhook entrant d'agrégateur (API `Request` standard : Next.js, Hono, Bun, Deno, Workers).
 * 401 si la signature est invalide ; 200 sinon, y compris pour un doublon ou une opération inconnue.
 * Le corps est lu brut : ne pas le parser avant (les signatures portent sur les octets exacts).
 */
export async function handleProviderRequest(engine: PontEngine, provider: string, request: Request): Promise<Response> {
  // Un identifiant mal formé est refusé tout de suite ; un identifiant bien formé mais non enregistré reçoit 404 du moteur.
  if (!CUSTOM_PROVIDER_ID.test(provider)) return Response.json({ error: "unknown_provider" }, { status: 404 });
  const rawBody = await request.text();
  try {
    const result = await engine.handleProviderWebhook(provider as ProviderId, request.headers, rawBody, { method: request.method, url: request.url });
    return Response.json({ received: true, status: result.status });
  } catch (error) {
    if (isPontError(error) && error.code === "invalid_signature") return Response.json({ error: "invalid_signature" }, { status: 401 });
    if (isPontError(error) && error.code === "configuration_error") return Response.json({ error: "provider_not_configured" }, { status: 404 });
    // Erreur interne : 500 pour que l'agrégateur réessaie plus tard.
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * Route Next.js App Router : `app/api/pont/hooks/[provider]/route.ts`
 *
 * ```ts
 * export const { POST } = createWebhookRoute(pont);
 * ```
 */
export function createWebhookRoute(engine: PontEngine) {
  return {
    async POST(request: Request, context: { params: Promise<{ provider: string }> | { provider: string } }): Promise<Response> {
      const { provider } = await context.params;
      return handleProviderRequest(engine, provider, request);
    },
  };
}

/**
 * Job planifié : réconcilie les opérations non réglées puis livre les webhooks dus.
 * Protégé par `Authorization: Bearer <CRON_SECRET>` (format de Vercel Cron).
 *
 * ```ts
 * // app/api/pont/cron/route.ts — vercel.json : { "crons": [{ "path": "/api/pont/cron", "schedule": "*\/5 * * * *" }] }
 * export const { GET } = createCronRoute(pont, { relay, secret: process.env.CRON_SECRET });
 * ```
 */
export function createCronRoute(engine: PontEngine, options: { relay?: WebhookRelay; secret: string | undefined }) {
  return {
    async GET(request: Request): Promise<Response> {
      if (!options.secret || options.secret.length < 16) return Response.json({ error: "cron_secret_missing" }, { status: 500 });
      const header = request.headers.get("authorization") ?? "";
      if (!safeEqual(header, `Bearer ${options.secret}`)) return Response.json({ error: "unauthorized" }, { status: 401 });
      const reconciliation = await engine.reconcile();
      const deliveries = options.relay ? await options.relay.processDue() : [];
      return Response.json({
        reconciliation,
        deliveries: { processed: deliveries.length, delivered: deliveries.filter((d) => d.status === "delivered").length },
      });
    },
  };
}

/** Côté application qui reçoit les webhooks Pont : vérifie `Pont-Signature` sur le corps brut. */
export function verifyPontSignature(secret: string, rawBody: string, header: string | null, toleranceSeconds = 300): boolean {
  return verifyPontWebhook(secret, rawBody, header, { toleranceSeconds });
}
