import type { Resource } from "@pont-bj/auth";

export interface LienNav {
  href: string;
  label: string;
  resource: Resource | null;
  action: string;
  /** Visible seulement si le stockage fournit portefeuille et registre. */
  portefeuille?: boolean;
  /** Seconde touche de la séquence « g puis … » (une lettre, unique dans toute la navigation). */
  touche?: string;
}

export interface Onglet extends LienNav {
  /** Routes qui activent cet onglet (la première est sa cible). */
  routes?: string[];
}

export const DEVELOPPEURS: Onglet[] = [
  { href: "/developpeurs", label: "Intégration", resource: null, action: "", touche: "d" },
  { href: "/developpeurs/cas-usage", label: "Cas d'usage", resource: null, action: "", touche: "c" },
  { href: "/cles", label: "Clés", resource: "cles", action: "lire", touche: "k" },
  { href: "/webhooks", label: "Webhooks", resource: "webhooks", action: "lire", touche: "h" },
  { href: "/developpeurs/journaux", label: "Journaux", resource: "webhooks", action: "lire", touche: "j" },
];

export const PARAMETRES: Onglet[] = [
  { href: "/utilisateurs", label: "Utilisateurs", resource: "utilisateurs", action: "lire", touche: "u" },
  { href: "/roles", label: "Rôles", resource: "roles", action: "lire", touche: "x" },
  { href: "/email", label: "E-mail", resource: "parametres", action: "lire", touche: "m" },
  { href: "/alertes", label: "Alertes", resource: "parametres", action: "lire", touche: "t" },
];

export const NAV_PRINCIPALE: LienNav[] = [
  { href: "/", label: "Vue d'ensemble", resource: "paiements", action: "lire", touche: "o" },
  { href: "/paiements", label: "Paiements", resource: "paiements", action: "lire", touche: "p" },
  { href: "/retraits", label: "Retraits", resource: "paiements", action: "lire", touche: "r" },
  { href: "/portefeuilles", label: "Portefeuilles", resource: "portefeuille", action: "lire", portefeuille: true, touche: "w" },
  { href: "/registre", label: "Registre", resource: "registre", action: "lire", portefeuille: true, touche: "l" },
  { href: "/agregateurs", label: "Agrégateurs", resource: "cles", action: "lire", touche: "a" },
  { href: "/developpeurs", label: "Développeurs", resource: null, action: "", touche: "d" },
];

/** Groupe (sidebar) auquel appartient une page : les onglets partagent l'entrée du menu. */
export function groupeDe(actif: string): "developpeurs" | "parametres" | null {
  if (DEVELOPPEURS.some((onglet) => actif === onglet.href)) return "developpeurs";
  if (PARAMETRES.some((onglet) => actif === onglet.href)) return "parametres";
  return null;
}

/** Entrée de sidebar active : `/portefeuilles/xyz` garde « Portefeuilles » allumé. */
export function estActif(actif: string, href: string, groupe: ReturnType<typeof groupeDe>): boolean {
  if (href === "/developpeurs") return groupe === "developpeurs";
  if (href === "/") return actif === "/";
  return actif === href || actif.startsWith(`${href}/`);
}
