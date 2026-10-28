import type { SVGProps } from "react";

/** Icônes 16 px, trait 1,5, reprises des maquettes Lunacy. `currentColor` : la couleur vient du texte parent. */
type P = SVGProps<SVGSVGElement>;
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconeApercu = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2" y="2" width="5" height="7" rx="1" />
    <rect x="9" y="2" width="5" height="4" rx="1" />
    <rect x="9" y="8" width="5" height="6" rx="1" />
    <rect x="2" y="11" width="5" height="3" rx="1" />
  </svg>
);
export const IconePaiements = (p: P) => (
  <svg {...base} {...p}>
    <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
    <path d="M1.5 7.25h13" strokeWidth="1.5" />
  </svg>
);
export const IconeRetraits = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 12 12 4M6 4h6v6" />
  </svg>
);
export const IconeAgregateurs = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6.25 1.5v3.5M9.75 1.5v3.5M7.75 10.5v4" />
    <path d="M3.5 5h9v3.25A2.25 2.25 0 0 1 10.25 10.5h-4.5A2.25 2.25 0 0 1 3.5 8.25Z" />
  </svg>
);
export const IconeDeveloppeurs = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4M9 3 7 13" />
  </svg>
);
export const IconeParametres = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 4h12M2 8h12M2 12h12" />
    <circle cx="10.75" cy="4" r="1.75" style={{ fill: "var(--icone-fond, #fafafa)" }} />
    <circle cx="5.75" cy="8" r="1.75" style={{ fill: "var(--icone-fond, #fafafa)" }} />
    <circle cx="11.75" cy="12" r="1.75" style={{ fill: "var(--icone-fond, #fafafa)" }} />
  </svg>
);
export const IconePortefeuille = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H12v2.5M2 4.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V6.5A1 1 0 0 0 13 5.5H3.5A1.5 1.5 0 0 1 2 4.5Z" />
    <circle cx="11" cy="9.5" r=".5" fill="currentColor" />
  </svg>
);
export const IconeRegistre = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 2h9v12h-9ZM6 5.5h4M6 8h4M6 10.5h2.5" />
  </svg>
);
export const IconeRecherche = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);
export const IconeChevrons = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 6 3-3 3 3M5 10l3 3 3-3" />
  </svg>
);
export const IconeChevronBas = (p: P) => (
  <svg width="8" height="4" viewBox="0 0 8 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="m.75.75 3.25 2.5L7.25.75" />
  </svg>
);
export const IconeCoche = (p: P) => (
  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="m1 4 2.75 2.75L9 1.25" />
  </svg>
);
export const IconeCroix = (p: P) => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden {...p}>
    <path d="m1 1 6 6M7 1 1 7" />
  </svg>
);
export const IconeAttention = (p: P) => (
  <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M7 1 13 11H1ZM7 4.5v3M7 9v.01" />
  </svg>
);
export const IconeRond = (p: P) => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...p}>
    <circle cx="4" cy="4" r="3.25" />
  </svg>
);
export const IconeRetour = (p: P) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M3.5 1.5 1 4l2.5 2.5M1 4h5A3 3 0 0 1 6 10H4" />
  </svg>
);
export const IconePlus = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden {...p}>
    <path d="M6 0v12M0 6h12" />
  </svg>
);
export const IconeMenu = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 4h12M2 8h12M2 12h12" />
  </svg>
);
