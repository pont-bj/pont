import { z } from "zod";
import { PontError } from "@pont-bj/core";
import { MemoryPaymentStore } from "@pont-bj/engine";
import type { ProviderAdapter } from "@pont-bj/core";
import { createPontFromEnv } from "@pont-bj/node";
import type { Vault } from "./vault.js";

interface FieldSpec {
  /** Variable d'environnement équivalente : le coffre se traduit en variables pour réutiliser `adaptersFromEnv`. */
  env: string;
  label: string;
  /** Secret : jamais renvoyé en entier, seulement masqué. */
  secret: boolean;
  required: boolean;
}

interface ProviderSpec {
  label: string;
  fields: Record<string, FieldSpec>;
}

export const PROVIDERS = {
  fedapay: {
    label: "FedaPay",
    fields: {
      secretKey: { env: "FEDAPAY_SECRET_KEY", label: "Clé secrète", secret: true, required: true },
      webhookSecret: { env: "FEDAPAY_WEBHOOK_SECRET", label: "Secret de webhook", secret: true, required: true },
    },
  },
  pawapay: {
    label: "PawaPay",
    fields: {
      apiToken: { env: "PAWAPAY_API_TOKEN", label: "Jeton d'API", secret: true, required: true },
      callbackPublicKeys: { env: "PAWAPAY_CALLBACK_PUBLIC_KEYS", label: "Clés publiques de callback (JSON)", secret: false, required: false },
    },
  },
  paydunya: {
    label: "PayDunya",
    fields: {
      masterKey: { env: "PAYDUNYA_MASTER_KEY", label: "Clé maître", secret: true, required: true },
      privateKey: { env: "PAYDUNYA_PRIVATE_KEY", label: "Clé privée", secret: true, required: true },
      token: { env: "PAYDUNYA_TOKEN", label: "Jeton", secret: true, required: true },
      storeName: { env: "PAYDUNYA_STORE_NAME", label: "Nom de la boutique", secret: false, required: true },
    },
  },
  kkiapay: {
    label: "Kkiapay",
    fields: {
      publicKey: { env: "KKIAPAY_PUBLIC_KEY", label: "Clé publique", secret: false, required: true },
      privateKey: { env: "KKIAPAY_PRIVATE_KEY", label: "Clé privée", secret: true, required: true },
      secretKey: { env: "KKIAPAY_SECRET_KEY", label: "Clé secrète", secret: true, required: true },
      webhookSecret: { env: "KKIAPAY_WEBHOOK_SECRET", label: "Secret de webhook", secret: true, required: true },
    },
  },
} as const satisfies Record<string, ProviderSpec>;

export type ProviderKey = keyof typeof PROVIDERS;

export function isProviderKey(value: string): value is ProviderKey {
  return Object.hasOwn(PROVIDERS, value);
}

export const storageKey = (id: string) => `provider:${id}`;
const valuesSchema = z.record(z.string());

/** Masque un secret : on reconnaît la clé sans pouvoir la relire. */
export function mask(value: string): string {
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••";
}

export async function storedValues(vault: Vault, id: string): Promise<Record<string, string>> {
  const raw = await vault.getJson(storageKey(id));
  return raw === null ? {} : valuesSchema.parse(raw);
}

/** Variables d'environnement + valeurs du coffre (le coffre l'emporte). */
export async function overlayEnv(source: Record<string, string | undefined>, vault: Vault | null): Promise<Record<string, string | undefined>> {
  if (!vault) return source;
  const merged = { ...source };
  for (const id of Object.keys(PROVIDERS) as ProviderKey[]) {
    const values = await storedValues(vault, id);
    for (const [field, spec] of Object.entries<FieldSpec>(PROVIDERS[id].fields)) {
      const value = values[field];
      if (value) merged[spec.env] = value;
    }
  }
  return merged;
}

export interface ProviderView {
  id: string;
  /** `true` pour un agrégateur personnalisé chargé depuis `PONT_PLUGINS_DIR`. */
  custom?: boolean;
  label: string;
  /** `vault` : saisi dans le dashboard ; `env` : variables d'environnement ; `none` : non configuré. */
  source: "vault" | "env" | "none";
  configured: boolean;
  webhookUrl: string;
  fields: Array<{ name: string; label: string; secret: boolean; required: boolean; set: boolean; value: string | null }>;
}

export async function listProviders(
  source: Record<string, string | undefined>,
  vault: Vault | null,
  publicUrl: string,
  hooksPath: string,
): Promise<ProviderView[]> {
  const base = publicUrl.replace(/\/$/, "");
  const views: ProviderView[] = [];
  for (const id of Object.keys(PROVIDERS) as ProviderKey[]) {
    const stored = vault ? await storedValues(vault, id) : {};
    const fields = Object.entries<FieldSpec>(PROVIDERS[id].fields).map(([name, spec]) => {
      const value = stored[name] ?? (source[spec.env] || undefined);
      return { name, label: spec.label, secret: spec.secret, required: spec.required, set: Boolean(value), value: value ? (spec.secret ? mask(value) : value) : null };
    });
    const fromVault = Object.keys(stored).length > 0;
    const configured = fields.filter((f) => f.required).every((f) => f.set) && fields.some((f) => f.set);
    views.push({
      id,
      label: PROVIDERS[id].label,
      source: fromVault ? "vault" : configured ? "env" : "none",
      configured,
      webhookUrl: `${base}${hooksPath}/${id}`,
      fields,
    });
  }
  return views;
}

const inputSchema = z.record(z.string().min(1).max(4000));

/**
 * Enregistre (fusionne) les identifiants d'un agrégateur. Un champ omis garde sa valeur : le dashboard n'a jamais
 * à relire un secret. La combinaison est validée avant d'écrire (champs requis, règle Kkiapay, JSON PawaPay).
 */
export async function saveProvider(
  id: ProviderKey,
  input: unknown,
  source: Record<string, string | undefined>,
  vault: Vault,
  /** Adaptateurs personnalisés déjà configurés : ils comptent dans la validation (règle Kkiapay). */
  extra: ProviderAdapter[] = [],
): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new PontError("invalid_request", "Corps invalide : un objet { champ: valeur } est attendu.");
  const known = PROVIDERS[id].fields as Record<string, FieldSpec>;
  const unknown = Object.keys(parsed.data).filter((name) => !(name in known));
  if (unknown.length > 0) throw new PontError("invalid_request", `Champs inconnus pour ${PROVIDERS[id].label} : ${unknown.join(", ")}.`);

  const next = { ...(await storedValues(vault, id)), ...parsed.data };
  const candidate = { ...(await overlayEnv(source, vault)) };
  for (const [name, spec] of Object.entries(known)) {
    if (next[name]) candidate[spec.env] = next[name];
  }
  // Construire le moteur applique toutes les règles (champs requis, JSON PawaPay, Kkiapay seul…) sans contacter personne.
  createPontFromEnv({ env: { ...candidate, PONT_SANDBOX: "false" }, stores: { payments: new MemoryPaymentStore() }, extraAdapters: extra });
  await vault.putJson(storageKey(id), next);
}

export async function deleteProvider(id: ProviderKey, vault: Vault): Promise<void> {
  await vault.delete(storageKey(id));
}

/** Au moins un agrégateur a des identifiants (complets ou non : la validation se fait à la construction). */
export function hasAnyProvider(env: Record<string, string | undefined>): boolean {
  return Object.values(PROVIDERS).some((provider) => Object.values<FieldSpec>(provider.fields).some((spec) => Boolean(env[spec.env])));
}
