/** Raccourcis clavier du dashboard : logique pure (testée), séparée de l'écoute des événements. */

/** Délai pendant lequel la seconde touche d'une séquence « g puis x » est attendue. */
export const DELAI_SEQUENCE_MS = 1200;

export interface CibleNavigation {
  touche: string;
  label: string;
  href: string;
}

/** Vrai si la frappe vise un champ de saisie : aucun raccourci ne doit voler une lettre à l'utilisateur. */
export function estChampDeSaisie(cible: { tagName?: string; isContentEditable?: boolean; getAttribute?: (nom: string) => string | null } | null): boolean {
  if (!cible) return false;
  const balise = (cible.tagName ?? "").toLowerCase();
  if (balise === "input" || balise === "textarea" || balise === "select") return true;
  if (cible.isContentEditable) return true;
  const role = cible.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

/** Page visée par « g » puis `touche`, ou `null`. */
export function cibleDeSequence(touche: string, cibles: CibleNavigation[]): CibleNavigation | null {
  const minuscule = touche.toLowerCase();
  return cibles.find((cible) => cible.touche === minuscule) ?? null;
}

export interface SectionSommaire {
  id: string;
  label: string;
}

/** Section visée par une touche : `1`..`9` (index direct), `j` (suivante), `k` (précédente). */
export function sectionDeTouche(touche: string, sections: SectionSommaire[], courante: number): number | null {
  if (sections.length === 0) return null;
  if (/^[1-9]$/.test(touche)) {
    const index = Number(touche) - 1;
    return index < sections.length ? index : null;
  }
  if (touche === "j") return Math.min(courante + 1, sections.length - 1);
  if (touche === "k") return Math.max(courante - 1, 0);
  return null;
}
