import "server-only";
import { RoleSet, roleNameSchema, roleDefinitionSchema, type RoleDefinition } from "@pont-bj/auth";
import { getAuth } from "./auth";
import { ADMIN_ROLE } from "./roles-db";

export { ADMIN_ROLE };

interface RoleRow {
  name: string;
  definition: string;
}

export async function loadRoles(): Promise<RoleSet> {
  const { db } = await getAuth();
  const rows = db.prepare("SELECT name, definition FROM pont_roles ORDER BY name").all() as unknown as RoleRow[];
  return RoleSet.from(Object.fromEntries(rows.map((row) => [row.name, JSON.parse(row.definition) as unknown])));
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveRole(name: string, input: unknown): Promise<SaveResult> {
  const parsedName = roleNameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0]?.message ?? "Nom de rôle invalide." };
  const parsed = roleDefinitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Rôle invalide." };
  const definition: RoleDefinition = parsed.data;
  if (name === ADMIN_ROLE && !definition.all) return { ok: false, error: "Le rôle « admin » garde l'accès total." };
  const { db } = await getAuth();
  db.prepare("INSERT INTO pont_roles (name, definition, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET definition = excluded.definition, updated_at = excluded.updated_at").run(
    name,
    JSON.stringify(definition),
    Date.now(),
  );
  return { ok: true };
}

export async function deleteRole(name: string): Promise<SaveResult> {
  if (name === ADMIN_ROLE) return { ok: false, error: "Le rôle « admin » ne peut pas être supprimé." };
  const { db } = await getAuth();
  const used = db.prepare('SELECT COUNT(*) AS total FROM "user" WHERE role = ?').get(name) as { total: number };
  if (used.total > 0) return { ok: false, error: `${used.total} utilisateur(s) ont ce rôle : changez-leur de rôle d'abord.` };
  db.prepare("DELETE FROM pont_roles WHERE name = ?").run(name);
  return { ok: true };
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  createdAt: string;
}

export async function listUsers(): Promise<UserRow[]> {
  const { db } = await getAuth();
  return db.prepare('SELECT id, name, email, role, createdAt FROM "user" ORDER BY createdAt DESC').all() as unknown as UserRow[];
}

export async function createUser(input: { name: string; email: string; password: string; role: string }): Promise<SaveResult> {
  const roles = await loadRoles();
  if (!roles.has(input.role)) return { ok: false, error: "Ce rôle n'existe pas." };
  const { auth } = await getAuth();
  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(input.email)) return { ok: false, error: "Cette adresse e-mail est déjà utilisée." };
  const user = await ctx.internalAdapter.createUser({ name: input.name, email: input.email, emailVerified: true, role: input.role }, { method: "email-password" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(input.password) });
  return { ok: true };
}

export async function setUserRole(userId: string, role: string, actorId: string): Promise<SaveResult> {
  const roles = await loadRoles();
  if (!roles.has(role)) return { ok: false, error: "Ce rôle n'existe pas." };
  const { db, auth } = await getAuth();
  if (userId === actorId && !roles.get(role)?.all) return { ok: false, error: "Vous ne pouvez pas retirer l'accès total à votre propre compte." };
  const admins = db.prepare('SELECT COUNT(*) AS total FROM "user" WHERE role = ? AND id <> ?').get(ADMIN_ROLE, userId) as { total: number };
  if (role !== ADMIN_ROLE && admins.total === 0) return { ok: false, error: "Il doit rester au moins un administrateur." };
  await (await auth.$context).internalAdapter.updateUser(userId, { role });
  return { ok: true };
}
