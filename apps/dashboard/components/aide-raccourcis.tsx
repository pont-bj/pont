"use client";

import { useEffect, useRef } from "react";

export interface GroupeRaccourcis {
  titre: string;
  lignes: { touches: string[]; label: string }[];
}

const Touche = ({ children }: { children: string }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-bordure bg-white px-1.5 font-sans text-[11px] font-medium text-zinc-600">{children}</kbd>
);

/** Panneau d'aide `?` : modal accessible (focus piégé, Échap pour fermer, focus rendu à l'ouverture). */
export function AideRaccourcis({ ouverte, fermer, groupes }: { ouverte: boolean; fermer: () => void; groupes: GroupeRaccourcis[] }) {
  const bouton = useRef<HTMLButtonElement>(null);
  const precedent = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ouverte) return;
    precedent.current = document.activeElement as HTMLElement | null;
    bouton.current?.focus();
    return () => precedent.current?.focus?.();
  }, [ouverte]);

  if (!ouverte) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-[10vh]" onMouseDown={(event) => event.target === event.currentTarget && fermer()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-raccourcis"
        className="w-full max-w-2xl rounded-2xl border border-bordure bg-white p-6 shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") fermer();
          // Piège de focus : un seul élément focalisable (le bouton), Tab reste dans la fenêtre.
          if (event.key === "Tab") {
            event.preventDefault();
            bouton.current?.focus();
          }
        }}
      >
        <div className="mb-4 flex items-center gap-3">
          <h2 id="titre-raccourcis" className="flex-1 text-lg font-semibold">
            Raccourcis clavier
          </h2>
          <button ref={bouton} onClick={fermer} className="rounded-lg border border-bordure px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">
            Fermer
          </button>
        </div>
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {groupes.map((groupe) => (
            <section key={groupe.titre}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{groupe.titre}</h3>
              <ul className="flex flex-col gap-1.5">
                {groupe.lignes.map((ligne) => (
                  <li key={ligne.label} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-zinc-700">{ligne.label}</span>
                    <span className="flex items-center gap-1">
                      {ligne.touches.map((touche, index) => (
                        <span key={`${touche}-${index}`} className="flex items-center gap-1">
                          {index > 0 && <span className="text-xs text-zinc-400">puis</span>}
                          <Touche>{touche}</Touche>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-5 text-xs text-zinc-400">Les raccourcis sont désactivés dans les champs de saisie et n'utilisent aucune combinaison du navigateur.</p>
      </div>
    </div>
  );
}
