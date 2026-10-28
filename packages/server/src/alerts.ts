import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DeliveryStore, PaymentStore, PayoutStore } from "@pont/engine";
import type { EmailService } from "./email.js";
import type { WalletKit } from "./wallet.js";
import type { Vault } from "./vault.js";

export const RULES = {
  payment_failed: { label: "Paiement échoué", description: "Un paiement a échoué chez l'agrégateur." },
  webhook_failed: { label: "Webhook non livré", description: "Une livraison vers votre application a échoué après toutes les relances." },
  payout_stuck: { label: "Retrait bloqué ou ambigu", description: "Un retrait demande une vérification, ou reste en attente depuis plus d'une heure." },
  low_balance: { label: "Solde de transit bas", description: "Un compte de transit passe sous le seuil défini." },
  admin_login: { label: "Connexion administrateur", description: "Un administrateur se connecte au dashboard." },
} as const;

export type RuleId = keyof typeof RULES;
export const RULE_IDS = Object.keys(RULES) as RuleId[];

const CONFIG_KEY = "alerts:config";
const HISTORY_PREFIX = "alert:";
const SEEN_PREFIX = "alertseen:";
const HISTORY_LIMIT = 200;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Un envoi en échec est retenté au plus toutes les 15 minutes. */
const RETRY_AFTER_FAILURE = 15 * 60_000;
const MAX_PER_DIGEST = 20;

const configSchema = z.object({
  rules: z.record(z.boolean()).default({}),
  recipients: z.array(z.string().email()).max(20).default([]),
  lowBalanceThreshold: z.number().int().default(0),
});

export interface AlertsConfig {
  rules: Record<RuleId, boolean>;
  recipients: string[];
  lowBalanceThreshold: number;
}

export interface AlertItem {
  rule: RuleId | "test";
  /** Même empreinte = même alerte : envoyée une seule fois sur la durée `windowMs`. */
  fingerprint: string;
  title: string;
  detail: string;
  windowMs: number;
}

export interface HistoryEntry {
  id: string;
  rule: string;
  title: string;
  detail: string;
  at: number;
  status: "sent" | "failed";
  error?: string;
}

export interface AlertSources {
  payments: PaymentStore;
  payouts: PayoutStore;
  deliveries: DeliveryStore;
  wallet: WalletKit | null;
}

export type AlertService = ReturnType<typeof createAlerts>;

const money = (amount: number, currency: string) => `${new Intl.NumberFormat("fr-FR").format(amount)} ${currency}`;

export function createAlerts(vault: Vault, email: EmailService, now: () => number = Date.now) {
  async function loadConfig(): Promise<AlertsConfig> {
    const raw = configSchema.parse((await vault.getJson(CONFIG_KEY)) ?? {});
    return {
      rules: Object.fromEntries(RULE_IDS.map((id) => [id, raw.rules[id] === true])) as Record<RuleId, boolean>,
      recipients: raw.recipients,
      lowBalanceThreshold: raw.lowBalanceThreshold,
    };
  }

  async function saveConfig(input: unknown): Promise<AlertsConfig> {
    const parsed = configSchema.safeParse(input);
    if (!parsed.success) throw new AlertConfigError(parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "));
    const unknownRules = Object.keys(parsed.data.rules).filter((id) => !(id in RULES));
    if (unknownRules.length > 0) throw new AlertConfigError(`Règles inconnues : ${unknownRules.join(", ")}.`);
    await vault.putJson(CONFIG_KEY, parsed.data);
    return loadConfig();
  }

  async function history(limit = 50): Promise<HistoryEntry[]> {
    // Les clés commencent par l'horodatage : l'ordre alphabétique est l'ordre chronologique.
    const keys = (await vault.list(HISTORY_PREFIX)).map((entry) => entry.key).sort().reverse().slice(0, limit);
    const rows = await Promise.all(keys.map((key) => vault.getJson(key)));
    return rows.filter((row): row is HistoryEntry => row !== null);
  }

  async function record(item: AlertItem, status: HistoryEntry["status"], error?: string): Promise<void> {
    const at = now();
    const id = `${String(at).padStart(13, "0")}-${randomUUID().slice(0, 8)}`;
    const entry: HistoryEntry = { id, rule: item.rule, title: item.title, detail: item.detail, at, status, ...(error ? { error } : {}) };
    await vault.putJson(`${HISTORY_PREFIX}${id}`, entry);
    const all = (await vault.list(HISTORY_PREFIX)).map((e) => e.key).sort();
    for (const key of all.slice(0, Math.max(0, all.length - HISTORY_LIMIT))) await vault.delete(key);
  }

  async function alreadySent(item: AlertItem): Promise<boolean> {
    const seen = (await vault.getJson(`${SEEN_PREFIX}${item.fingerprint}`)) as { at: number; ok: boolean } | null;
    if (!seen) return false;
    return now() - seen.at < (seen.ok ? item.windowMs : RETRY_AFTER_FAILURE);
  }

  /**
   * Envoie un seul e-mail récapitulatif pour toutes les alertes nouvelles. Sans SMTP ni destinataire, rien n'est
   * marqué comme envoyé : elles partiront dès que la configuration sera complète.
   */
  async function dispatch(items: AlertItem[]): Promise<number> {
    const config = await loadConfig();
    if (config.recipients.length === 0 || !(await email.load())) return 0;
    const fresh: AlertItem[] = [];
    for (const item of items) {
      if (fresh.length >= MAX_PER_DIGEST) break;
      if (!(await alreadySent(item))) fresh.push(item);
    }
    if (fresh.length === 0) return 0;

    const lines = fresh.map((item) => `• ${item.title}\n  ${item.detail}`);
    const subject = fresh.length === 1 ? `Pont : ${fresh[0]!.title}` : `Pont : ${fresh.length} alertes`;
    let error: string | undefined;
    try {
      await email.send({ to: config.recipients, subject, text: `${lines.join("\n\n")}\n\n— Pont (alertes configurées dans le dashboard, page Alertes)` });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Envoi impossible.";
    }
    for (const item of fresh) {
      await vault.putJson(`${SEEN_PREFIX}${item.fingerprint}`, { at: now(), ok: !error });
      await record(item, error ? "failed" : "sent", error);
    }
    return error ? 0 : fresh.length;
  }

  async function collect(sources: AlertSources, config: AlertsConfig): Promise<AlertItem[]> {
    const items: AlertItem[] = [];
    const since = now() - DAY;

    if (config.rules.payment_failed) {
      for (const payment of await sources.payments.listRecent(100)) {
        if (payment.status === "failed" && payment.updatedAt >= since) {
          items.push({ rule: "payment_failed", fingerprint: `payment_failed:${payment.id}`, title: "Paiement échoué", detail: `${money(payment.amount, payment.currency)}, référence ${payment.reference} (${payment.id}).`, windowMs: 7 * DAY });
        }
      }
    }

    if (config.rules.webhook_failed) {
      for (const delivery of await sources.deliveries.listRecent(100)) {
        const last = delivery.attempts.at(-1)?.at ?? delivery.createdAt;
        if (delivery.status === "failed" && last >= since) {
          items.push({ rule: "webhook_failed", fingerprint: `webhook_failed:${delivery.id}`, title: "Webhook non livré", detail: `Livraison ${delivery.id} vers ${delivery.url} abandonnée après ${delivery.attempts.length} tentative(s).`, windowMs: 7 * DAY });
        }
      }
    }

    if (config.rules.payout_stuck) {
      for (const payout of await sources.payouts.listRecent(100)) {
        const waiting = (payout.status === "pending" || payout.status === "processing") && payout.updatedAt < now() - HOUR;
        if ((payout.needsReconciliation || waiting) && payout.createdAt >= now() - 7 * DAY) {
          items.push({ rule: "payout_stuck", fingerprint: `payout_stuck:${payout.id}:${payout.status}`, title: "Retrait bloqué ou ambigu", detail: `${money(payout.amount, payout.currency)}, référence ${payout.reference} (${payout.id}), statut ${payout.status}.`, windowMs: 7 * DAY });
        }
      }
    }

    if (config.rules.low_balance && sources.wallet) {
      for (const account of await sources.wallet.store.listAccounts({ prefix: "system:transit:", limit: 100 })) {
        if (account.balance < config.lowBalanceThreshold) {
          items.push({ rule: "low_balance", fingerprint: `low_balance:${account.code}`, title: "Solde de transit bas", detail: `${account.code} : ${money(account.balance, account.currency)} (seuil ${money(config.lowBalanceThreshold, account.currency)}).`, windowMs: DAY });
        }
      }
    }
    return items;
  }

  return {
    config: loadConfig,
    saveConfig,
    history,

    /** Appelé par le planificateur : évalue les règles actives et envoie un récapitulatif des nouveautés. */
    async evaluate(sources: AlertSources): Promise<number> {
      const config = await loadConfig();
      if (!Object.values(config.rules).some(Boolean)) return 0;
      const sentAt = now();
      const sent = await dispatch(await collect(sources, config));
      // Ménage : les empreintes de plus de 7 jours ne servent plus.
      for (const entry of await vault.list(SEEN_PREFIX)) if (entry.updatedAt < sentAt - 7 * DAY) await vault.delete(entry.key);
      return sent;
    },

    /** Évènement ponctuel (ex. connexion administrateur) : règle active requise, jamais dédoublonné. */
    async notify(rule: RuleId, title: string, detail: string): Promise<boolean> {
      if (!(await loadConfig()).rules[rule]) return false;
      return (await dispatch([{ rule, fingerprint: `${rule}:${randomUUID()}`, title, detail, windowMs: 0 }])) > 0;
    },

    /** Alerte de test, envoyée à tous les destinataires quelle que soit l'activation des règles. */
    async sendTest(): Promise<boolean> {
      return (await dispatch([{ rule: "test", fingerprint: `test:${randomUUID()}`, title: "Alerte de test", detail: "Si vous lisez ce message, les alertes Pont fonctionnent.", windowMs: 0 }])) > 0;
    },
  };
}

export class AlertConfigError extends Error {}
