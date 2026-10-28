import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const SEUIL_AFFICHAGE = 50;
const FENETRE_MS = 60 * 60 * 1000;
const MAX_PAR_FENETRE = 10;

function secretAttendu(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const secret = env?.LANDING_SECRET;
  if (!secret) throw new Error("LANDING_SECRET manquant");
  return secret;
}

/** Nombre d'inscrits, masqué tant qu'il est sous le seuil (jamais gonflé). */
export const compteur = query({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.query("compteurs").withIndex("by_nom", (q) => q.eq("nom", "inscriptions")).unique();
    const valeur = c?.valeur ?? 0;
    return valeur >= SEUIL_AFFICHAGE ? valeur : null;
  },
});

/** Inscription. Appelée uniquement par le serveur Next (secret partagé), après validation Zod. */
export const inscrire = mutation({
  args: {
    secret: v.string(),
    email: v.string(),
    role: v.union(v.literal("developpeur"), v.literal("fondateur"), v.literal("agence"), v.literal("autre")),
    source: v.optional(v.string()),
    empreinte: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== secretAttendu()) throw new Error("Non autorisé");

    const maintenant = Date.now();
    const t = await ctx.db.query("tentatives").withIndex("by_cle", (q) => q.eq("cle", args.empreinte)).unique();
    if (t && maintenant - t.fenetre < FENETRE_MS) {
      if (t.nombre >= MAX_PAR_FENETRE) return { statut: "limite" as const };
      await ctx.db.patch(t._id, { nombre: t.nombre + 1 });
    } else if (t) {
      await ctx.db.patch(t._id, { fenetre: maintenant, nombre: 1 });
    } else {
      await ctx.db.insert("tentatives", { cle: args.empreinte, fenetre: maintenant, nombre: 1 });
    }

    const email = args.email.trim().toLowerCase();
    const existant = await ctx.db.query("inscriptions").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (existant) return { statut: "deja" as const, position: existant.position };

    const c = await ctx.db.query("compteurs").withIndex("by_nom", (q) => q.eq("nom", "inscriptions")).unique();
    const position = (c?.valeur ?? 0) + 1;
    if (c) await ctx.db.patch(c._id, { valeur: position });
    else await ctx.db.insert("compteurs", { nom: "inscriptions", valeur: position });

    await ctx.db.insert("inscriptions", {
      email,
      role: args.role,
      position,
      consentementAt: maintenant,
      ...(args.source ? { source: args.source.slice(0, 40) } : {}),
    });
    return { statut: "inscrit" as const, position };
  },
});
