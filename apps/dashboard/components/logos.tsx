import { BF, BJ, CD, CG, CI, CM, GA, GN, ML, NE, SN, TG } from "country-flag-icons/react/3x2";
import { nomAgregateur, nomPays } from "@/lib/calculs";
import { couleurMonogramme, initiales } from "@/lib/identite";

const DRAPEAUX = { BJ, BF, CD, CG, CI, CM, GA, GN, ML, NE, SN, TG } as const;

/** Drapeau SVG (jamais d'emoji : Windows ne les affiche pas) ; le nom du pays reste écrit à côté. */
export function CountryFlag({ code, className = "" }: { code: string; className?: string }) {
  const Drapeau = DRAPEAUX[code as keyof typeof DRAPEAUX];
  if (!Drapeau) return null;
  return <Drapeau aria-hidden focusable="false" className={`inline-block h-[14px] w-[21px] shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.1)] ${className}`} />;
}

/** « 🇧🇯 Bénin » : drapeau et nom alignés sur la ligne de texte. */
export function Pays({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <CountryFlag code={code} />
      <span className="truncate">{nomPays(code)}</span>
    </span>
  );
}

/** Logos officiels, repris de la landing (`apps/landing/public/agregateurs`). Largeur = hauteur × ratio d'origine. */
const MARQUES: Record<string, { src: string; ratio: number }> = {
  fedapay: { src: "/providers/fedapay.svg", ratio: 118 / 24 },
  pawapay: { src: "/providers/pawapay.svg", ratio: 714 / 153 },
  paydunya: { src: "/providers/paydunya.png", ratio: 231 / 56 },
  kkiapay: { src: "/providers/kkiapay.svg", ratio: 173 / 32 },
};

interface LogoProps {
  id: string;
  /** Libellé de repli (agrégateur personnalisé) ; sinon le nom connu de l'agrégateur. */
  label?: string;
  /** Hauteur du logo en px. */
  hauteur?: number;
  /** Agrégateur non connecté : logo estompé. */
  grise?: boolean;
  className?: string;
}

/**
 * Logo d'un agrégateur. Les quatre agrégateurs intégrés ont leur logo ; Sandbox et les agrégateurs personnalisés
 * (aucun logo officiel à reprendre) reçoivent un monogramme coloré, stable d'une visite à l'autre, suivi du nom.
 */
export function ProviderLogo({ id, label, hauteur = 18, grise = false, className = "" }: LogoProps) {
  const nom = label ?? nomAgregateur(id);
  const marque = MARQUES[id];
  if (marque) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- SVG/PNG statiques de petite taille, sans optimisation utile
      <img src={marque.src} alt={nom} title={nom} height={hauteur} width={Math.round(hauteur * marque.ratio)} className={`inline-block shrink-0 select-none ${grise ? "opacity-45 grayscale" : ""} ${className}`} style={{ height: hauteur, width: "auto" }} />
    );
  }
  const taille = Math.round(hauteur * 1.25);
  const couleur = id === "sandbox" ? "#71717a" : couleurMonogramme(id);
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${grise ? "opacity-60" : ""} ${className}`} title={nom}>
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold leading-none text-white"
        style={{ width: taille, height: taille, background: couleur, fontSize: Math.max(8, Math.round(taille * 0.42)) }}
      >
        {initiales(nom)}
      </span>
      <span className="truncate font-medium" style={{ fontSize: Math.max(11, Math.round(hauteur * 0.75)) }}>
        {nom}
      </span>
    </span>
  );
}

/** Plusieurs agrégateurs côte à côte (colonnes « Dépôt via » / « Retrait via »). */
export function ListeLogos({ ids, hauteur = 14 }: { ids: string[]; hauteur?: number }) {
  if (ids.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {ids.map((id) => (
        <ProviderLogo key={id} id={id} hauteur={hauteur} />
      ))}
    </span>
  );
}

/** « Bénin · [logo] » : sous-titre d'une ligne de paiement ou de retrait. */
export function PaysEtAgregateur({ code, provider }: { code: string; provider: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Pays code={code} />
      <span aria-hidden>·</span>
      <ProviderLogo id={provider} hauteur={11} />
    </span>
  );
}
