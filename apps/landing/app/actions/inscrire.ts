"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { convexServeur } from "@/lib/convex";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["developpeur", "fondateur", "agence", "autre"]),
  consentement: z.literal("on"),
  source: z.string().max(40).optional(),
  // Pot de miel : un humain ne remplit jamais ce champ caché.
  site: z.string().max(0).optional(),
});

export type EtatInscription =
  | { statut: "repos" }
  | { statut: "erreur"; message: string }
  | { statut: "inscrit" | "deja"; position: number };

function chaine(valeur: FormDataEntryValue | null): string | undefined {
  return typeof valeur === "string" && valeur.length > 0 ? valeur : undefined;
}

export async function inscrire(_: EtatInscription, form: FormData): Promise<EtatInscription> {
  const resultat = Schema.safeParse({
    email: chaine(form.get("email")) ?? "",
    role: chaine(form.get("role")) ?? "developpeur",
    consentement: chaine(form.get("consentement")),
    source: chaine(form.get("source")),
    site: chaine(form.get("site")),
  });
  if (!resultat.success) {
    const champ = resultat.error.issues[0]?.path[0];
    if (champ === "consentement") return { statut: "erreur", message: "Merci d'accepter d'être contacté." };
    if (champ === "site") return { statut: "erreur", message: "Inscription refusée." };
    return { statut: "erreur", message: "Adresse email invalide." };
  }

  const secret = process.env.LANDING_SECRET;
  if (!secret) return { statut: "erreur", message: "Service indisponible, réessayez plus tard." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "inconnue";
  const empreinte = createHash("sha256").update(`${ip}:${secret}`).digest("hex");

  try {
    const r = await convexServeur().mutation(api.liste.inscrire, {
      secret,
      email: resultat.data.email,
      role: resultat.data.role,
      empreinte,
      ...(resultat.data.source ? { source: resultat.data.source } : {}),
    });
    if (r.statut === "limite") return { statut: "erreur", message: "Trop de tentatives. Réessayez dans une heure." };
    return { statut: r.statut, position: r.position };
  } catch {
    return { statut: "erreur", message: "Service indisponible, réessayez plus tard." };
  }
}
