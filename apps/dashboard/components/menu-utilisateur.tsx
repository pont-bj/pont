"use client";

import { useEffect, useRef, useState } from "react";

/** Pied de sidebar : initiales, nom, et menu avec e-mail, rôle et déconnexion. */
export function MenuUtilisateur({ nom, email, role, deconnexion }: { nom: string; email: string; role: string; deconnexion: () => Promise<void> }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (event: MouseEvent) => !racine.current?.contains(event.target as Node) && setOuvert(false);
    const echap = (event: KeyboardEvent) => event.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  return (
    <div ref={racine} className="relative">
      <button onClick={() => setOuvert((o) => !o)} aria-haspopup="menu" aria-expanded={ouvert} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-[9px] text-left transition hover:bg-zinc-100">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-texte">{initiales || "?"}</span>
        <span className="truncate text-[13px] font-medium text-zinc-700">{nom}</span>
      </button>
      {ouvert && (
        <div role="menu" className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-bordure bg-white p-1.5 shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{email}</p>
            <p className="text-xs text-zinc-500">Rôle : {role}</p>
          </div>
          <form action={deconnexion} className="border-t border-ligne pt-1">
            <button role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100">
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
