import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { env } from "./env";
import { notifyAdminLogin, sendEmail } from "./pont";
import { ADMIN_ROLE, ensureRolesTable } from "./roles-db";

function userCount(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS total FROM "user"').get() as { total: number }).total;
}

function roleExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 AS found FROM pont_roles WHERE name = ?").get(name) !== undefined;
}

function create() {
  const config = env();
  mkdirSync(dirname(config.DASHBOARD_DB_PATH), { recursive: true });
  const db = new DatabaseSync(config.DASHBOARD_DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const trustedOrigins = (config.PONT_TRUSTED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);

  const auth = betterAuth({
    database: db,
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      // L'envoi passe par le serveur Pont, qui détient la configuration SMTP chiffrée.
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          user.email,
          "Réinitialisation de votre mot de passe Pont",
          `Bonjour,\n\nVous avez demandé à réinitialiser votre mot de passe Pont. Ouvrez ce lien (valable 1 heure) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
        );
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            const user = db.prepare('SELECT email, role FROM "user" WHERE id = ?').get(session.userId) as { email: string; role: string | null } | undefined;
            if (user?.role === ADMIN_ROLE) void notifyAdminLogin(`${user.email}${session.ipAddress ? ` depuis ${session.ipAddress}` : ""}`);
          },
        },
      },
      user: {
        create: {
          before: async (user, context) => {
            // Premier compte : administrateur. Ensuite, création par le dashboard (sans contexte HTTP)
            // ou par un administrateur ; l'inscription publique n'est ouverte que si PONT_SIGNUP_ROLE est défini.
            if (userCount(db) === 0) return { data: { ...user, role: ADMIN_ROLE } };
            const path = context?.path ?? "";
            if (!context || path.startsWith("/admin/")) return { data: user };
            const signupRole = config.PONT_SIGNUP_ROLE;
            if (!signupRole || signupRole === ADMIN_ROLE || !roleExists(db, signupRole)) throw new Error("Les inscriptions sont fermées.");
            return { data: { ...user, role: signupRole } };
          },
        },
      },
    },
    // Les rôles et leurs permissions sont gérés par Pont (table pont_roles) ; le plugin ne porte que l'identité et le champ `role`.
    plugins: [admin({ adminRoles: [ADMIN_ROLE], defaultRole: config.PONT_SIGNUP_ROLE ?? "user" }), nextCookies()],
  });

  const ready = getMigrations(auth.options)
    .then(({ runMigrations }) => runMigrations())
    .then(() => ensureRolesTable(db));
  return { auth, db, ready };
}

let instance: ReturnType<typeof create> | undefined;

/** Instance Better Auth ; schéma SQLite migré et rôles initialisés avant le premier usage. */
export async function getAuth() {
  instance ??= create();
  await instance.ready;
  return instance;
}

export async function hasAdmin(): Promise<boolean> {
  const { db } = await getAuth();
  return userCount(db) > 0;
}
