import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listPayments } from "@/lib/pont";
import { loadRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Recherche de paiements pour la palette ⌘K : référence ou identifiant, dans les 200 derniers. Exige `paiements.lire`. */
export async function GET(request: Request) {
  const { auth } = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 401 });
  const roles = await loadRoles();
  if (!roles.can(session.user.role, "dashboard", "acceder") || !roles.can(session.user.role, "paiements", "lire")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const requete = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (requete.length < 2) return NextResponse.json({ data: [] });
  const paiements = await listPayments(200);
  const data = paiements
    .filter((paiement) => paiement.reference.toLowerCase().includes(requete) || paiement.id.toLowerCase().includes(requete))
    .slice(0, 6)
    .map(({ id, reference, amount, currency, status }) => ({ id, reference, amount, currency, status }));
  return NextResponse.json({ data });
}
