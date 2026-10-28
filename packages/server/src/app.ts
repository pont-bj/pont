import { isPontError, safeEqual, type PontError } from "@pont-bj/core";
import type { DeliveryStore, PaymentStore, PayoutStore, PontEngine, RefundStore } from "@pont-bj/engine";
import { coverageOf, healthOf, timelineOf } from "./dashboard.js";
import { handleProviderRequest } from "@pont-bj/node";
import { ledgerUnavailable, walletAdmin, walletError, walletV1, type WalletKit } from "./wallet.js";

export interface AppOptions {
  engine: PontEngine;
  stores: { payments: PaymentStore; payouts: PayoutStore; refunds?: RefundStore; deliveries?: DeliveryStore };
  apiKey: string;
  adminToken: string;
  /** Portefeuilles et registre ; `null` si le stockage choisi n'a pas de registre. */
  wallet?: WalletKit | null;
  /** Sandbox actif : active `POST /admin/test-payment`. */
  sandbox: boolean;
}

const STATUS_BY_CODE: Record<PontError["code"], number> = {
  invalid_request: 400,
  idempotency_conflict: 409,
  amount_not_allowed: 422,
  invalid_phone: 422,
  no_provider_available: 422,
  provider_rejected: 502,
  payment_not_found: 404,
  invalid_transition: 409,
  invalid_signature: 401,
  configuration_error: 500,
};

export function errorResponse(error: unknown): Response {
  const business = walletError(error);
  if (business) return business;
  if (isPontError(error)) {
    return Response.json({ error: { code: error.code, message: error.messageFr, ...(error.fix ? { fix: error.fix } : {}) } }, { status: STATUS_BY_CODE[error.code] });
  }
  // Détail interne jamais renvoyé au client : il peut contenir des données de l'agrégateur.
  return Response.json({ error: { code: "internal_error", message: "Erreur interne." } }, { status: 500 });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

export function authorized(request: Request, expected: string): boolean {
  const given = bearer(request);
  return given.length > 0 && safeEqual(given, expected);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Clé d'idempotence : l'en-tête `Idempotency-Key` si fourni, sinon dérivée du corps (la `reference` de commande,
 * ou le paiement et le montant pour un remboursement). Le moteur refuse la même clé avec un contenu différent.
 */
function idempotencyKey(request: Request, scope: string, body: unknown): string | undefined {
  const header = request.headers.get("idempotency-key");
  if (header) return header;
  if (typeof body !== "object" || body === null) return undefined;
  const fields = body as Record<string, unknown>;
  const reference = fields.reference;
  if (typeof reference === "string" && reference.length > 0 && reference.length <= 64) return `auto:${scope}:${reference}`;
  return undefined;
}

const missingKey = () =>
  Response.json({ error: { code: "invalid_request", message: "Ajoutez une `reference` (ou un en-tête Idempotency-Key)." } }, { status: 400 });

function limitParam(url: URL): number {
  const raw = Number(url.searchParams.get("limit") ?? 50);
  return Number.isInteger(raw) && raw > 0 ? Math.min(raw, 200) : 50;
}

const unauthorized = () => Response.json({ error: { code: "unauthorized", message: "Authentification requise." } }, { status: 401 });
const notFound = () => Response.json({ error: { code: "not_found", message: "Route introuvable." } }, { status: 404 });

/** Gestionnaire HTTP au format `Request` → `Response` (Node, Bun, Deno, Workers). */
export function createApp(options: AppOptions): (request: Request) => Promise<Response> {
  const { engine, stores } = options;

  async function v1(request: Request, path: string[]): Promise<Response> {
    const [resource, id, sub] = path;
    if (resource === "wallets") {
      if (!options.wallet) return ledgerUnavailable();
      return (await walletV1(request, path.slice(1), options.wallet)) ?? notFound();
    }
    if (resource === "payments") {
      if (request.method === "POST" && id === undefined) {
        const body = await readJson(request);
        const key = idempotencyKey(request, "payment", body);
        if (!key) return missingKey();
        return Response.json(await engine.createPayment(body, key), { status: 201 });
      }
      if (request.method === "GET" && id !== undefined && sub === undefined) return Response.json(await engine.getPayment(id));
      if (request.method === "POST" && id !== undefined && sub === "refresh") return Response.json(await engine.refreshPayment(id));
      if (request.method === "POST" && id !== undefined && sub === "refunds") {
        const body = await readJson(request);
        const amount = typeof body === "object" && body !== null && "amount" in body ? String((body as { amount: unknown }).amount) : "full";
        const key = request.headers.get("idempotency-key") ?? `auto:refund:${id}:${amount}`;
        return Response.json(await engine.createRefund(id, body, key), { status: 201 });
      }
    }
    if (resource === "payouts") {
      if (request.method === "POST" && id === undefined) {
        const body = await readJson(request);
        const key = idempotencyKey(request, "payout", body);
        if (!key) return missingKey();
        return Response.json(await engine.createPayout(body, key), { status: 201 });
      }
      if (request.method === "GET" && id !== undefined && sub === undefined) return Response.json(await engine.getPayout(id));
      if (request.method === "POST" && id !== undefined && sub === "refresh") return Response.json(await engine.refreshPayout(id));
    }
    return notFound();
  }

  async function admin(request: Request, url: URL, path: string[]): Promise<Response> {
    const [resource] = path;
    if (resource === "wallets" || resource === "ledger") {
      if (!options.wallet) return ledgerUnavailable();
      return (await walletAdmin(request, url, path, options.wallet)) ?? notFound();
    }
    if (request.method === "GET" && resource === "payments" && path[1] !== undefined) {
      const payment = await stores.payments.get(path[1]);
      if (!payment) return Response.json({ error: { code: "payment_not_found", message: "Paiement introuvable." } }, { status: 404 });
      const [deliveries, refunds] = await Promise.all([stores.deliveries?.listRecent(200) ?? [], stores.refunds?.listByPayment(payment.id) ?? []]);
      return Response.json({ payment, refunds, timeline: stores.refunds ? await timelineOf(payment, deliveries, stores.refunds) : [] });
    }
    if (request.method === "POST" && resource === "payments" && path[1] !== undefined && path[2] === "refund") {
      const body = await readJson(request);
      const amount = typeof body === "object" && body !== null && "amount" in body ? String((body as { amount: unknown }).amount) : "full";
      return Response.json(await engine.createRefund(path[1], body, `auto:refund:${path[1]}:${amount}`), { status: 201 });
    }
    if (request.method === "GET" && resource === "coverage") return Response.json({ data: coverageOf(engine.listAdapters()) });
    if (request.method === "GET" && resource === "providers-health") {
      return Response.json({ data: healthOf(engine.listAdapters(), await stores.payments.listRecent(200), Date.now()) });
    }
    if (request.method === "GET" && resource === "payments") return Response.json({ data: await stores.payments.listRecent(limitParam(url)) });
    if (request.method === "GET" && resource === "payouts") return Response.json({ data: await stores.payouts.listRecent(limitParam(url)) });
    if (request.method === "GET" && resource === "overview") {
      const [payments, payouts] = await Promise.all([stores.payments.listRecent(200), stores.payouts.listRecent(200)]);
      const succeeded = payments.filter((payment) => payment.status === "succeeded");
      return Response.json({
        sandbox: options.sandbox,
        mode: engine.mode,
        features: { wallet: Boolean(options.wallet) },
        payments: { recent: payments.slice(0, 20), count: payments.length, succeeded: succeeded.length, volume: succeeded.reduce((sum, payment) => sum + payment.amount, 0) },
        payouts: { recent: payouts.slice(0, 20), count: payouts.length },
      });
    }
    if (request.method === "POST" && resource === "test-payment") {
      if (!options.sandbox) return Response.json({ error: { code: "forbidden", message: "Paiement de test disponible uniquement en sandbox." } }, { status: 403 });
      const body = (await readJson(request)) as { scenario?: unknown } | undefined;
      const suffix = typeof body?.scenario === "string" && /^\d{7}$/.test(body.scenario) ? body.scenario : "0000001";
      const reference = `test-${Date.now()}`;
      const payment = await engine.createPayment(
        { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: `+229010${suffix}` }, reference, description: "Paiement de test depuis le dashboard" },
        `dashboard-${reference}-${crypto.randomUUID()}`,
      );
      return Response.json(await engine.refreshPayment(payment.id), { status: 201 });
    }
    return notFound();
  }

  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.split("/").filter(Boolean);
    try {
      if (request.method === "GET" && url.pathname === "/health") return Response.json({ status: "ok" });
      if (path[0] === "hooks" && path[1] && request.method === "POST") return handleProviderRequest(engine, path[1], request);
      if (path[0] === "v1") return authorized(request, options.apiKey) ? await v1(request, path.slice(1)) : unauthorized();
      if (path[0] === "admin") return authorized(request, options.adminToken) ? await admin(request, url, path.slice(1)) : unauthorized();
      return notFound();
    } catch (error) {
      return errorResponse(error);
    }
  };
}
