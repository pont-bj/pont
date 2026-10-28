import { z } from "zod";
import { RESOURCE_NAMES, type Resource } from "@pont/auth";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { loadRoles } from "@/lib/roles";

/**
 * Autorisation pour l'application du développeur : « cet utilisateur peut-il faire cette action ? ».
 * Authentifié par la clé API (la même que `/v1`). Le rôle vient toujours de la base, jamais de l'appelant.
 *
 * POST { "cookie": "<en-tête Cookie de l'utilisateur>" | "userId": "…", "resource": "paiements", "action": "creer" }
 */
const bodySchema = z
  .object({
    resource: z.enum(RESOURCE_NAMES as [Resource, ...Resource[]]),
    action: z.string().min(1).max(40),
    cookie: z.string().max(4096).optional(),
    userId: z.string().min(1).max(128).optional(),
  })
  .refine((body) => Boolean(body.cookie) !== Boolean(body.userId), "Fournissez `cookie` ou `userId`, pas les deux.");

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i % Math.max(right.length, 1)] ?? 0);
  return diff === 0;
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given || !safeEqual(given, env().PONT_API_KEY)) return json({ error: { code: "unauthorized", message: "Authentification requise." } }, 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "Requête invalide." } }, 400);
  const { resource, action, cookie, userId } = parsed.data;

  const { auth, db } = await getAuth();
  let id: string | undefined = userId;
  if (cookie) {
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    id = session?.user.id;
  }
  if (!id) return json({ allowed: false, role: null, reason: "no_session" }, 200);

  const row = db.prepare('SELECT role, banned FROM "user" WHERE id = ?').get(id) as { role: string | null; banned: number | null } | undefined;
  if (!row || row.banned) return json({ allowed: false, role: null, reason: "unknown_user" }, 200);
  const roles = await loadRoles();
  return json({ allowed: roles.can(row.role, resource, action), role: row.role, kycTier: row.role ? (roles.get(row.role)?.kycTier ?? null) : null }, 200);
}
