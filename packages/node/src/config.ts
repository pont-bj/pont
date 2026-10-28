import { z } from "zod";
import { PontError, type ProviderAdapter, type ProviderId } from "@pont/core";
import { SandboxAdapter } from "@pont/sandbox";
import { FedaPayAdapter } from "@pont/adapter-fedapay";
import { PawaPayAdapter } from "@pont/adapter-pawapay";
import { PayDunyaAdapter } from "@pont/adapter-paydunya";
import { KkiapayAdapter } from "@pont/adapter-kkiapay";
import { CinetPayAdapter } from "@pont/adapter-cinetpay";

/**
 * Variables d'environnement lues par `createPontFromEnv`. Les clés restent chez le marchand (ADR-001, option B).
 * Un agrégateur est activé dès que ses variables sont présentes.
 */
const envSchema = z.object({
  PONT_MODE: z.enum(["test", "live"]).default("test"),
  /** Sandbox Pont à numéros magiques, sans compte agrégateur. Interdit en live. */
  PONT_SANDBOX: z.enum(["true", "false"]).default("false"),
  /** URL publique de l'application, pour construire les URL de webhooks agrégateurs. */
  PONT_PUBLIC_URL: z.string().url(),
  PONT_HOOKS_PATH: z.string().default("/api/pont/hooks"),
  PONT_FAILOVER: z.enum(["true", "false"]).default("false"),

  FEDAPAY_SECRET_KEY: z.string().optional(),
  FEDAPAY_WEBHOOK_SECRET: z.string().optional(),

  PAWAPAY_API_TOKEN: z.string().optional(),
  /** JSON `{ "<keyid>": "<PEM>" }` ; active l'exigence de callbacks signés. */
  PAWAPAY_CALLBACK_PUBLIC_KEYS: z.string().optional(),

  PAYDUNYA_MASTER_KEY: z.string().optional(),
  PAYDUNYA_PRIVATE_KEY: z.string().optional(),
  PAYDUNYA_TOKEN: z.string().optional(),
  PAYDUNYA_STORE_NAME: z.string().optional(),

  KKIAPAY_PUBLIC_KEY: z.string().optional(),
  KKIAPAY_PRIVATE_KEY: z.string().optional(),
  KKIAPAY_SECRET_KEY: z.string().optional(),
  KKIAPAY_WEBHOOK_SECRET: z.string().optional(),

  /** CinetPay est expérimental (doc non vérifiable, CGU non lues) : activation explicite requise. */
  PONT_ENABLE_CINETPAY: z.enum(["true", "false"]).default("false"),
  CINETPAY_API_KEY: z.string().optional(),
  CINETPAY_SITE_ID: z.string().optional(),
});

export type PontEnv = z.infer<typeof envSchema>;

function requireAll(provider: string, values: Record<string, string | undefined>): Record<string, string> | null {
  const present = Object.entries(values).filter(([, v]) => v !== undefined && v !== "");
  if (present.length === 0) return null;
  const missing = Object.entries(values).filter(([, v]) => v === undefined || v === "").map(([k]) => k);
  if (missing.length > 0) throw new PontError("configuration_error", `${provider} : variables manquantes ${missing.join(", ")}.`);
  return values as Record<string, string>;
}

function parsePublicKeys(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PontError("configuration_error", "PAWAPAY_CALLBACK_PUBLIC_KEYS doit être un objet JSON { keyid: PEM }.");
  }
  const result = z.record(z.string().min(1)).safeParse(parsed);
  if (!result.success) throw new PontError("configuration_error", "PAWAPAY_CALLBACK_PUBLIC_KEYS doit être un objet JSON { keyid: PEM }.");
  return result.data;
}

export function parseEnv(source: Record<string, string | undefined>): PontEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new PontError("configuration_error", result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "));
  }
  return result.data;
}

export function adaptersFromEnv(env: PontEnv, options: { allowEmpty?: boolean } = {}): ProviderAdapter[] {
  const mode = env.PONT_MODE;
  if (env.PONT_SANDBOX === "true") {
    if (mode === "live") throw new PontError("configuration_error", "PONT_SANDBOX=true est interdit en mode live.");
    return [new SandboxAdapter()];
  }

  const adapters: ProviderAdapter[] = [];
  const fedapay = requireAll("FedaPay", { FEDAPAY_SECRET_KEY: env.FEDAPAY_SECRET_KEY, FEDAPAY_WEBHOOK_SECRET: env.FEDAPAY_WEBHOOK_SECRET });
  if (fedapay) adapters.push(new FedaPayAdapter({ mode, secretKey: fedapay.FEDAPAY_SECRET_KEY!, webhookSecret: fedapay.FEDAPAY_WEBHOOK_SECRET! }));

  if (env.PAWAPAY_API_TOKEN) {
    adapters.push(
      new PawaPayAdapter({
        mode,
        apiToken: env.PAWAPAY_API_TOKEN,
        ...(env.PAWAPAY_CALLBACK_PUBLIC_KEYS ? { callbackPublicKeys: parsePublicKeys(env.PAWAPAY_CALLBACK_PUBLIC_KEYS) } : {}),
      }),
    );
  }

  const paydunya = requireAll("PayDunya", {
    PAYDUNYA_MASTER_KEY: env.PAYDUNYA_MASTER_KEY,
    PAYDUNYA_PRIVATE_KEY: env.PAYDUNYA_PRIVATE_KEY,
    PAYDUNYA_TOKEN: env.PAYDUNYA_TOKEN,
    PAYDUNYA_STORE_NAME: env.PAYDUNYA_STORE_NAME,
  });
  if (paydunya) {
    adapters.push(
      new PayDunyaAdapter({
        mode,
        masterKey: paydunya.PAYDUNYA_MASTER_KEY!,
        privateKey: paydunya.PAYDUNYA_PRIVATE_KEY!,
        token: paydunya.PAYDUNYA_TOKEN!,
        storeName: paydunya.PAYDUNYA_STORE_NAME!,
      }),
    );
  }

  const kkiapay = requireAll("Kkiapay", {
    KKIAPAY_PUBLIC_KEY: env.KKIAPAY_PUBLIC_KEY,
    KKIAPAY_PRIVATE_KEY: env.KKIAPAY_PRIVATE_KEY,
    KKIAPAY_SECRET_KEY: env.KKIAPAY_SECRET_KEY,
    KKIAPAY_WEBHOOK_SECRET: env.KKIAPAY_WEBHOOK_SECRET,
  });
  if (kkiapay) {
    adapters.push(
      new KkiapayAdapter({
        mode,
        publicKey: kkiapay.KKIAPAY_PUBLIC_KEY!,
        privateKey: kkiapay.KKIAPAY_PRIVATE_KEY!,
        secretKey: kkiapay.KKIAPAY_SECRET_KEY!,
        webhookSecret: kkiapay.KKIAPAY_WEBHOOK_SECRET!,
      }),
    );
  }

  if (env.PONT_ENABLE_CINETPAY === "true") {
    const cinetpay = requireAll("CinetPay", { CINETPAY_API_KEY: env.CINETPAY_API_KEY, CINETPAY_SITE_ID: env.CINETPAY_SITE_ID });
    if (cinetpay) adapters.push(new CinetPayAdapter({ mode, apiKey: cinetpay.CINETPAY_API_KEY!, siteId: cinetpay.CINETPAY_SITE_ID! }));
  }

  if (adapters.length === 0 && !options.allowEmpty) {
    throw new PontError(
      "configuration_error",
      "Aucun agrégateur configuré.",
      "Renseignez les clés d'au moins un agrégateur, ou PONT_SANDBOX=true pour tester sans compte.",
    );
  }
  return adapters;
}

export function callbackUrlFor(env: PontEnv): (provider: ProviderId) => string {
  const base = env.PONT_PUBLIC_URL.replace(/\/$/, "");
  const path = env.PONT_HOOKS_PATH.startsWith("/") ? env.PONT_HOOKS_PATH : `/${env.PONT_HOOKS_PATH}`;
  return (provider) => `${base}${path}/${provider}`;
}
