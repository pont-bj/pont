import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { PontError, requestJson, type FetchLike, type Mode } from "@pont-bj/core";
import { serializeEvent, signedDelivery } from "./delivery.js";
import type { PontEvent } from "./engine.js";

/** Délais avant chaque tentative (secondes) : immédiat, puis jusqu'à ~3 jours. Cahier des charges §6 F4. */
export const DEFAULT_RETRY_SCHEDULE = [0, 60, 300, 1_800, 7_200, 21_600, 43_200, 86_400, 172_800, 259_200] as const;

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
}

export interface DeliveryAttempt {
  at: number;
  httpStatus: number | null;
  error: string | null;
  durationMs: number;
}

export interface Delivery {
  id: string;
  eventId: string;
  endpointId: string;
  url: string;
  body: string;
  status: "pending" | "delivered" | "failed";
  attempts: DeliveryAttempt[];
  nextAttemptAt: number | null;
  createdAt: number;
}

export interface DeliveryStore {
  insert(delivery: Delivery): Promise<void>;
  update(delivery: Delivery): Promise<void>;
  get(id: string): Promise<Delivery | null>;
  due(now: number, limit: number): Promise<Delivery[]>;
  /** Livraisons les plus récentes d'abord (dashboard). */
  listRecent(limit: number): Promise<Delivery[]>;
}

export class MemoryDeliveryStore implements DeliveryStore {
  private readonly deliveries = new Map<string, Delivery>();

  async insert(delivery: Delivery): Promise<void> {
    this.deliveries.set(delivery.id, structuredClone(delivery));
  }

  async update(delivery: Delivery): Promise<void> {
    this.deliveries.set(delivery.id, structuredClone(delivery));
  }

  async get(id: string): Promise<Delivery | null> {
    const delivery = this.deliveries.get(id);
    return delivery ? structuredClone(delivery) : null;
  }

  async due(now: number, limit: number): Promise<Delivery[]> {
    return [...this.deliveries.values()]
      .filter((d) => d.status === "pending" && d.nextAttemptAt !== null && d.nextAttemptAt <= now)
      .sort((a, b) => (a.nextAttemptAt ?? 0) - (b.nextAttemptAt ?? 0))
      .slice(0, limit)
      .map((d) => structuredClone(d));
  }

  async listRecent(limit: number): Promise<Delivery[]> {
    return [...this.deliveries.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((d) => structuredClone(d));
  }
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * Refuse les URL qui permettraient d'atteindre le réseau interne (SSRF) ou d'envoyer en clair.
 * En mode test, `http://localhost` est autorisé pour `pont listen`.
 * Limite : un nom de domaine qui résout vers une IP privée doit être bloqué au niveau réseau de l'hébergeur.
 */
export function assertDeliverableUrl(raw: string, mode: Mode): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PontError("invalid_request", `URL de webhook invalide : ${raw}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (mode === "test" && isLocal) return;
  if (url.protocol !== "https:") throw new PontError("invalid_request", "Les webhooks doivent utiliser HTTPS.");
  if (url.username || url.password) throw new PontError("invalid_request", "Identifiants interdits dans l'URL de webhook.");
  if (isLocal || host.endsWith(".local") || host.endsWith(".internal")) throw new PontError("invalid_request", "Adresse interne interdite.");
  const ipVersion = isIP(host);
  if (ipVersion === 4 && PRIVATE_V4.some((re) => re.test(host))) throw new PontError("invalid_request", "Adresse IP privée interdite.");
  if (ipVersion === 6 && /^(fc|fd|fe80|::ffff:)/i.test(host)) throw new PontError("invalid_request", "Adresse IP privée interdite.");
}

export interface WebhookRelayConfig {
  mode: Mode;
  endpoints: WebhookEndpoint[];
  store: DeliveryStore;
  fetch?: FetchLike;
  now?: () => number;
  scheduleSeconds?: readonly number[];
  timeoutMs?: number;
}

/**
 * Relais des webhooks sortants : livraison au moins une fois, signée à chaque tentative (horodatage frais),
 * retries exponentiels sur ~3 jours, historique de chaque tentative. `processDue` est appelé par un job planifié.
 */
export class WebhookRelay {
  private readonly config: WebhookRelayConfig;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly schedule: readonly number[];

  constructor(config: WebhookRelayConfig) {
    for (const endpoint of config.endpoints) assertDeliverableUrl(endpoint.url, config.mode);
    this.config = config;
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
    this.schedule = config.scheduleSeconds ?? DEFAULT_RETRY_SCHEDULE;
  }

  /** Remplace les destinataires (ajout ou retrait depuis le dashboard). Valide toutes les URL avant de changer quoi que ce soit. */
  setEndpoints(endpoints: WebhookEndpoint[]): void {
    for (const endpoint of endpoints) assertDeliverableUrl(endpoint.url, this.config.mode);
    this.config.endpoints = endpoints;
  }

  /** À brancher sur `EngineConfig.onEvent`. */
  async enqueue(event: PontEvent): Promise<Delivery[]> {
    const body = serializeEvent(event);
    const now = this.now();
    const deliveries: Delivery[] = [];
    for (const endpoint of this.config.endpoints) {
      const delivery: Delivery = {
        id: `whd_${randomUUID().replace(/-/g, "")}`,
        eventId: event.id,
        endpointId: endpoint.id,
        url: endpoint.url,
        body,
        status: "pending",
        attempts: [],
        nextAttemptAt: now + (this.schedule[0] ?? 0) * 1000,
        createdAt: now,
      };
      await this.config.store.insert(delivery);
      deliveries.push(delivery);
    }
    return deliveries;
  }

  /** Envoie les livraisons arrivées à échéance. */
  async processDue(limit = 50): Promise<Delivery[]> {
    const due = await this.config.store.due(this.now(), limit);
    const results: Delivery[] = [];
    for (const delivery of due) results.push(await this.attempt(delivery));
    return results;
  }

  /** Renvoi manuel (dashboard, CLI, MCP) : remet la livraison en file immédiatement. */
  async resend(deliveryId: string): Promise<Delivery> {
    const delivery = await this.config.store.get(deliveryId);
    if (!delivery) throw new PontError("payment_not_found", deliveryId);
    return this.attempt({ ...delivery, status: "pending" });
  }

  private async attempt(delivery: Delivery): Promise<Delivery> {
    const endpoint = this.config.endpoints.find((e) => e.id === delivery.endpointId);
    if (!endpoint) {
      const failed: Delivery = { ...delivery, status: "failed", nextAttemptAt: null };
      await this.config.store.update(failed);
      return failed;
    }
    const startedAt = this.now();
    const signed = signedDelivery(endpoint.secret, delivery.body, delivery.eventId, Math.floor(startedAt / 1000));
    const result = await requestJson(this.fetchImpl, delivery.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      redirect: "manual", // une redirection pourrait mener vers une adresse interne
      timeoutMs: this.config.timeoutMs ?? 10_000,
    });
    const httpStatus = result.kind === "response" ? result.status : null;
    const ok = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
    const attempts: DeliveryAttempt[] = [
      ...delivery.attempts,
      { at: startedAt, httpStatus, error: result.kind === "response" ? null : result.reason, durationMs: this.now() - startedAt },
    ];
    const nextDelay = this.schedule[attempts.length];
    const updated: Delivery = ok
      ? { ...delivery, attempts, status: "delivered", nextAttemptAt: null }
      : nextDelay === undefined
        ? { ...delivery, attempts, status: "failed", nextAttemptAt: null }
        : { ...delivery, attempts, status: "pending", nextAttemptAt: delivery.createdAt + nextDelay * 1000 };
    await this.config.store.update(updated);
    return updated;
  }
}
