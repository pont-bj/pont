import { z } from "zod";
import { PRESET_NAMES } from "@pont-bj/auth";

const schema = z.object({
  /** Adresse interne du serveur Pont. */
  PONT_URL: z.string().url().default("http://localhost:8787"),
  PONT_ADMIN_TOKEN: z.string().min(32),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL publique du dashboard (origine des cookies et des redirections). */
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  DASHBOARD_DB_PATH: z.string().default("./data/dashboard.db"),
  /** Clé de l'application du développeur, pour `/api/pont/*` (la même que celle de `/v1` du serveur Pont). */
  PONT_API_KEY: z.string().min(32),
  /** Rôles de départ : portefeuille, tontine ou marketplace. Modifiables ensuite dans le dashboard. */
  PONT_ROLES_PRESET: z.enum(PRESET_NAMES as [string, ...string[]]).default("portefeuille"),
  /** Si renseigné, l'inscription publique est ouverte et attribue ce rôle. Vide : inscriptions fermées. */
  PONT_SIGNUP_ROLE: z.string().optional(),
  /** Origines autorisées à appeler l'authentification (URL de votre application, séparées par des virgules). */
  PONT_TRUSTED_ORIGINS: z.string().optional(),
});

export type DashboardEnv = z.infer<typeof schema>;

let cached: DashboardEnv | undefined;

export function env(): DashboardEnv {
  if (cached) return cached;
  const present = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ""));
  const result = schema.safeParse(present);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");
    throw new Error(`Configuration du dashboard invalide. ${detail}`);
  }
  cached = result.data;
  return cached;
}
