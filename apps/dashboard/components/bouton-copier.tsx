"use client";

import { useState } from "react";

/** Copie dans le presse-papiers ; le libellé confirme (« Copié ») pendant 1,5 s. */
export function BoutonCopier({ texte, className = "", sombre = false }: { texte: string; className?: string; sombre?: boolean }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setCopie(true);
          setTimeout(() => setCopie(false), 1500);
        } catch {
          /* presse-papiers refusé (contexte non sécurisé) : l'utilisateur copie à la main */
        }
      }}
      className={`${sombre ? "text-zinc-300 hover:text-white" : "text-indigo-fonce hover:underline"} text-sm font-medium ${className}`}
    >
      <span aria-live="polite">{copie ? "Copié" : "Copier"}</span>
    </button>
  );
}
