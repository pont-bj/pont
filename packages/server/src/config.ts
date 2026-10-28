import { z } from "zod";
import { PontError } from "@pont-bj/core";

const secret = z.string().min(32, "32 caractères minimum (openssl rand -hex 32).");

const serverEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    /** Clé que l'application du marchand présente à l'API `/v1`. */
    PONT_API_KEY: secret,
    /** Jeton du dashboard pour l'API `/admin`. */
    PONT_ADMIN_TOKEN: secret,
    PONT_STORE: z.enum(["memory", "convex", "postgres"]).default("memory"),
    /** Base PostgreSQL (la vôtre) avec PONT_STORE=postgres. */
    DATABASE_URL: z.string().min(1).optional(),
    CONVEX_URL: z.string().url().optional(),
    PONT_STORE_SECRET: secret.optional(),
    /** Application du marchand qui reçoit les événements Pont (paiement réussi, etc.). */
    PONT_WEBHOOK_URL: z.string().url().optional(),
    PONT_WEBHOOK_SECRET: secret.optional(),
    /** Dossier des agrégateurs personnalisés (`pont provider new`) : un sous-dossier par agrégateur. Exécute leur code : voir la doc. */
    PONT_PLUGINS_DIR: z.string().min(1).optional(),
    /** Clé maître du coffre (64 hex). Sans elle, les clés d'agrégateurs ne se saisissent pas dans le dashboard : variables d'environnement seulement. */
    PONT_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "64 caractères hexadécimaux (openssl rand -hex 32).").optional(),
    /** Devise des portefeuilles. */
    PONT_WALLET_CURRENCY: z.enum(["XOF", "XAF"]).default("XOF"),
    /** Plafonds par palier KYC (JSON : `{"tiers":{"basique":{"maxBalance":…}}}`). Par défaut : ceux de la recette portefeuille. */
    PONT_LIMITS: z.string().optional(),
    /** Frais de retrait en points de base (100 = 1 %). */
    PONT_WITHDRAWAL_FEE_BPS: z.coerce.number().int().min(0).max(2000).default(0),
    /** Intervalle de la réconciliation et de la livraison des webhooks. */
    PONT_TICK_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  })
  .superRefine((env, ctx) => {
    if (env.PONT_STORE === "convex") {
      if (!env.CONVEX_URL) ctx.addIssue({ code: "custom", path: ["CONVEX_URL"], message: "Requis avec PONT_STORE=convex." });
      if (!env.PONT_STORE_SECRET) ctx.addIssue({ code: "custom", path: ["PONT_STORE_SECRET"], message: "Requis avec PONT_STORE=convex." });
    }
    if (env.PONT_STORE === "postgres" && !env.DATABASE_URL) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Requis avec PONT_STORE=postgres." });
    }
    if (Boolean(env.PONT_WEBHOOK_URL) !== Boolean(env.PONT_WEBHOOK_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["PONT_WEBHOOK_SECRET"], message: "PONT_WEBHOOK_URL et PONT_WEBHOOK_SECRET vont ensemble." });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  // Docker Compose transmet les variables vides sous forme de chaînes vides : on les traite comme absentes.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
  const result = serverEnvSchema.safeParse(present);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");
    throw new PontError("configuration_error", detail);
  }
  return result.data;
}
