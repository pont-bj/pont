import type { DatabaseSync } from "node:sqlite";
import { PRESETS, RoleSet, type PresetName } from "@pont-bj/auth";
import { env } from "./env";

/** Le rôle « admin » existe toujours et garde l'accès total : on ne peut pas se verrouiller hors du dashboard. */
export const ADMIN_ROLE = "admin";

/** Crée la table des rôles et la remplit avec le modèle choisi (PONT_ROLES_PRESET) au premier lancement. */
export function ensureRolesTable(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS pont_roles (name TEXT PRIMARY KEY, definition TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  // Mise à niveau : une instance créée avant les rôles n'a aucun administrateur. Le premier compte le devient.
  db.prepare('UPDATE "user" SET role = ? WHERE id = (SELECT id FROM "user" ORDER BY createdAt LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "user" WHERE role = ?)').run(ADMIN_ROLE, ADMIN_ROLE);
  const row = db.prepare("SELECT COUNT(*) AS total FROM pont_roles").get() as { total: number };
  if (row.total > 0) return;
  const preset = PRESETS[env().PONT_ROLES_PRESET as PresetName];
  const insert = db.prepare("INSERT INTO pont_roles (name, definition, updated_at) VALUES (?, ?, ?)");
  for (const [name, definition] of Object.entries(RoleSet.from(preset).toJSON())) insert.run(name, JSON.stringify(definition), Date.now());
}
