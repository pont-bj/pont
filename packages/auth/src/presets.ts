import type { RoleMap } from "./roles.js";

/** Rôles de départ selon le type de fintech. Modifiables ensuite dans le dashboard. */
export const PRESETS = {
  portefeuille: {
    client: { label: "Client", permissions: { paiements: ["creer", "lire"], retraits: ["creer", "lire"], portefeuille: ["lire"] }, kycTier: "basique" },
    agent: { label: "Agent", permissions: { paiements: ["creer", "lire"], retraits: ["creer", "lire"], portefeuille: ["lire", "crediter", "debiter"], utilisateurs: ["lire"] }, kycTier: "complet" },
    comptable: { label: "Comptable", permissions: { dashboard: ["acceder"], paiements: ["lire"], retraits: ["lire"], registre: ["lire"], portefeuille: ["lire"] } },
    admin: { label: "Administrateur", all: true },
  },
  tontine: {
    membre: { label: "Membre", permissions: { paiements: ["creer", "lire"], portefeuille: ["lire"] }, kycTier: "basique" },
    tresorier: { label: "Trésorier", permissions: { dashboard: ["acceder"], paiements: ["creer", "lire"], retraits: ["creer", "lire"], portefeuille: ["lire", "crediter", "debiter"], registre: ["lire"] }, kycTier: "complet" },
    president: { label: "Président", permissions: { dashboard: ["acceder"], paiements: ["lire"], retraits: ["lire", "approuver"], registre: ["lire"], utilisateurs: ["lire", "gerer"] } },
    admin: { label: "Administrateur", all: true },
  },
  marketplace: {
    acheteur: { label: "Acheteur", permissions: { paiements: ["creer", "lire"] }, kycTier: "basique" },
    vendeur: { label: "Vendeur", permissions: { paiements: ["lire"], retraits: ["creer", "lire"], portefeuille: ["lire"] }, kycTier: "complet" },
    support: { label: "Support", permissions: { dashboard: ["acceder"], paiements: ["lire", "rembourser"], utilisateurs: ["lire"] } },
    admin: { label: "Administrateur", all: true },
  },
} as const satisfies Record<string, RoleMap>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];
