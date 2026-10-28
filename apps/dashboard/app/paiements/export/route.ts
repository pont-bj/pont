import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { correspond, estFiltre, nomAgregateur, versCsv } from "@/lib/calculs";
import { listPayments } from "@/lib/pont";
import { loadRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Export CSV des paiements (mêmes filtres que la page). Exige `paiements.lire` ; séparateur « ; » pour Excel en français. */
export async function GET(request: Request) {
  const { auth } = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 401 });
  const roles = await loadRoles();
  if (!roles.can(session.user.role, "dashboard", "acceder") || !roles.can(session.user.role, "paiements", "lire")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const statut = params.get("statut") ?? undefined;
  const filtre = estFiltre(statut) ? statut : "tous";
  const agregateur = params.get("agregateur");
  const paiements = (await listPayments(200)).filter((p) => correspond(p, filtre) && (!agregateur || p.provider === agregateur));
  const csv = versCsv(
    ["Identifiant", "Référence", "Montant", "Devise", "Statut", "À réconcilier", "Pays", "Opérateur", "Agrégateur", "Créé le"],
    paiements.map((p) => [p.id, p.reference, p.amount, p.currency, p.status, p.needsReconciliation ? "oui" : "non", p.country, p.operator ?? "", nomAgregateur(p.provider), new Date(p.createdAt).toISOString()]),
  );
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="paiements-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
}
