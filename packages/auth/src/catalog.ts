/**
 * Ressources de Pont sur lesquelles un rôle peut recevoir des permissions, et leurs actions.
 * Les identifiants sont en français pour rester lisibles dans `pont.config` et dans le dashboard.
 */
export const RESOURCES = {
  dashboard: { label: "Dashboard Pont", actions: ["acceder"] },
  paiements: { label: "Paiements", actions: ["creer", "lire", "rembourser"] },
  retraits: { label: "Retraits", actions: ["creer", "lire", "approuver"] },
  portefeuille: { label: "Portefeuille", actions: ["lire", "crediter", "debiter"] },
  registre: { label: "Registre comptable", actions: ["lire"] },
  webhooks: { label: "Webhooks", actions: ["lire", "gerer"] },
  cles: { label: "Clés des agrégateurs", actions: ["lire", "gerer"] },
  utilisateurs: { label: "Utilisateurs", actions: ["lire", "gerer"] },
  roles: { label: "Rôles", actions: ["lire", "gerer"] },
  parametres: { label: "E-mail et alertes", actions: ["lire", "gerer"] },
} as const;

export type Resource = keyof typeof RESOURCES;
export type Action<R extends Resource = Resource> = (typeof RESOURCES)[R]["actions"][number];

export const ACTION_LABELS: Record<string, string> = {
  creer: "Créer",
  lire: "Lire",
  rembourser: "Rembourser",
  approuver: "Approuver",
  crediter: "Créditer",
  debiter: "Débiter",
  gerer: "Gérer",
  acceder: "Accéder",
};

export const RESOURCE_NAMES = Object.keys(RESOURCES) as Resource[];
