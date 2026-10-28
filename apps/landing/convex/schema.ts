import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  inscriptions: defineTable({
    email: v.string(),
    role: v.union(v.literal("developpeur"), v.literal("fondateur"), v.literal("agence"), v.literal("autre")),
    position: v.number(),
    source: v.optional(v.string()),
    consentementAt: v.number(),
  }).index("by_email", ["email"]),
  compteurs: defineTable({ nom: v.string(), valeur: v.number() }).index("by_nom", ["nom"]),
  // Limitation de débit par empreinte d'IP (jamais l'IP en clair).
  tentatives: defineTable({ cle: v.string(), fenetre: v.number(), nombre: v.number() }).index("by_cle", ["cle"]),
});
