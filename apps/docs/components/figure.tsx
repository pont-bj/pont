import { BASE_PATH } from "@/lib/base-path";

interface Props {
  /** Chemin sous `public/screens/`, sans le dossier : `apercu.webp`. */
  fichier: string;
  alt: string;
  legende?: string;
  largeur?: number;
  hauteur?: number;
}

/** Capture du dashboard : cadre arrondi et bordure, lisible en clair comme en sombre (les captures restent claires, le cadre les détache du fond). */
export function Figure({ fichier, alt, legende, largeur = 1440, hauteur = 900 }: Props) {
  return (
    <figure className="not-prose my-6">
      <img
        src={`${BASE_PATH}/screens/${fichier}`}
        alt={alt}
        width={largeur}
        height={hauteur}
        loading="lazy"
        decoding="async"
        className="w-full rounded-xl border border-fd-border bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      />
      {legende && <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">{legende}</figcaption>}
    </figure>
  );
}
