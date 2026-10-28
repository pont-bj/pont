import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Resource } from "@pont/auth";
import { getAuth, hasAdmin } from "./auth";
import { loadRoles } from "./roles";

/** Session d'un utilisateur autorisé à entrer dans le dashboard (permission `dashboard.acceder`). */
export async function requireSession() {
  if (!(await hasAdmin())) redirect("/setup");
  const { auth } = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const roles = await loadRoles();
  if (!roles.can(session.user.role, "dashboard", "acceder")) redirect("/acces-refuse");
  return { ...session, roles };
}

/** Page ou action réservée : redirige vers « accès refusé » si le rôle n'a pas la permission. */
export async function requirePermission(resource: Resource, action: string) {
  const session = await requireSession();
  if (!session.roles.can(session.user.role, resource, action)) redirect("/acces-refuse");
  return session;
}
