"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

export interface Option { valeur: string; libelle: string }

/** Menu déroulant maison : le <select> natif s'affiche vide sous des parents filtrés (flou). */
export function ChoixRole({ nom, options, defaut }: { nom: string; options: readonly Option[]; defaut: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(defaut);
  const [actif, setActif] = useState(0);
  const racine = useRef<HTMLDivElement>(null);
  const idListe = useId();
  const choisie = options.find((o) => o.valeur === valeur) ?? options[0];

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

  function clavier(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOuvert(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!ouvert) { setOuvert(true); setActif(Math.max(0, options.findIndex((o) => o.valeur === valeur))); return; }
      setActif((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    }
    if ((e.key === "Enter" || e.key === " ") && ouvert) {
      e.preventDefault();
      const o = options[actif];
      if (o) setValeur(o.valeur);
      setOuvert(false);
    }
  }

  return (
    <div ref={racine} className="relative sm:w-[160px]" onKeyDown={clavier}>
      <input type="hidden" name={nom} value={valeur} />
      <button
        type="button"
        aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={idListe} aria-label={`Vous êtes : ${choisie?.libelle ?? ""}`}
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-3 text-left text-sm text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo"
      >
        <span className="truncate">{choisie?.libelle}</span>
        <motion.svg animate={{ rotate: ouvert ? 180 : 0 }} viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden="true">
          <path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {ouvert && (
          <motion.ul
            id={idListe} role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 origin-top overflow-hidden rounded-xl border border-bordure bg-white p-1 text-left shadow-[0_16px_40px_rgba(24,24,27,0.14)] sm:min-w-[200px]"
          >
            {options.map((o, i) => (
              <li
                key={o.valeur} role="option" aria-selected={o.valeur === valeur}
                onMouseEnter={() => setActif(i)}
                onClick={() => { setValeur(o.valeur); setOuvert(false); }}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-800 ${i === actif ? "bg-indigo-50" : ""}`}
              >
                {o.libelle}
                {o.valeur === valeur && <span className="text-indigo">✓</span>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
