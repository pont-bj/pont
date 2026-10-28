/** Identité visuelle des agrégateurs et avertissement d'adresse publique : fonctions pures (testées). */

const TEINTES = ["#4f46e5", "#0e7490", "#b45309", "#be123c", "#15803d", "#7e22ce", "#c2410c", "#0f766e"] as const;

/** Couleur stable pour un identifiant : un agrégateur personnalisé garde la même pastille d'une visite à l'autre. */
export function couleurMonogramme(id: string): string {
  let hash = 0;
  for (const caractere of id) hash = (hash * 31 + caractere.codePointAt(0)!) >>> 0;
  return TEINTES[hash % TEINTES.length]!;
}

/** Initiales d'un libellé : « Mon Agrégateur » → « MA », « momopay » → « MO ». */
export function initiales(libelle: string): string {
  const mots = libelle.trim().split(/[\s_-]+/).filter(Boolean);
  if (mots.length >= 2) return `${mots[0]![0]}${mots[1]![0]}`.toUpperCase();
  return (mots[0] ?? "?").slice(0, 2).toUpperCase();
}

/**
 * Vrai si l'adresse ne peut pas être jointe par un agrégateur : localhost, boucle locale, réseaux privés, `.local`,
 * ou HTTP simple. Une adresse illisible compte aussi comme non publique.
 */
export function estUrlNonPublique(adresse: string): boolean {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return true;
  }
  const hote = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:") return true;
  if (hote === "localhost" || hote.endsWith(".localhost") || hote.endsWith(".local") || hote.endsWith(".internal")) return true;
  if (hote === "::1" || hote === "0.0.0.0" || /^(fc|fd|fe80)/.test(hote)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hote);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return false;
}
