/** Icônes au trait (grille 24, style Lucide) : un seul composant, aucune dépendance. */
const TRACES = {
  echange: "M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4",
  bouclier: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  cle: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  cloche: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  courrier: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  portefeuille: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z",
  eclair: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  terminal: "M4 17l6-6-6-6M12 19h8",
  equipe: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  tableau: "M3 3h18v18H3zM3 9h18M9 21V9",
  cadenas: "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4",
  etincelles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z",
  livre: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  fiole: "M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3",
  activite: "M22 12h-4l-3 9L9 3l-3 9H2",
  base: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5",
  commande: "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z",
  liste: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  relance: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  coche: "M20 6L9 17l-5-5",
  serveur: "M2 3h20v7H2zM2 14h20v7H2zM6 6.5h.01M6 17.5h.01",
  brique: "M3 3h18v6H3zM3 15h18v6H3zM9 9v6M15 9v6",
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, className = "h-5 w-5" }: { nom: NomIcone; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={TRACES[nom]} />
    </svg>
  );
}

/** Pastille d'icône : carré indigo clair qui s'allume au survol de la carte parente (`group`). */
export function PastilleIcone({ nom, className = "" }: { nom: NomIcone; className?: string }) {
  return (
    <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo transition duration-300 group-hover:bg-indigo group-hover:text-white ${className}`}>
      <Icone nom={nom} />
    </span>
  );
}
