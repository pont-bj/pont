import Link from "next/link";
import type { ReactNode } from "react";

/** Classes partagées, relevées sur les maquettes : champs, boutons et cartes. */
export const champ = "w-full rounded-lg border border-bordure bg-white px-3 py-2 text-sm text-encre placeholder:text-zinc-400 outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100 disabled:bg-zinc-50 disabled:text-zinc-400";
export const bouton = "inline-flex items-center justify-center gap-2 rounded-lg border border-bordure bg-white px-3.5 py-2 text-sm font-medium text-encre transition hover:bg-zinc-50 disabled:opacity-60";
export const boutonPlein = "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60";
export const boutonDanger = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60";
export const lien = "font-medium text-indigo-fonce hover:underline";

export function Carte({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`rounded-2xl border border-bordure bg-white ${className}`}>{children}</div>;
}

/** Titre de carte : intitulé 14 px medium, description 12 px grise, action facultative à droite. */
export function CarteEntete({ titre, texte, action }: { titre: string; texte?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 pb-2 pt-[18px]">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium">{titre}</h2>
        {texte && <p className="mt-0.5 text-xs text-zinc-400">{texte}</p>}
      </div>
      {action}
    </div>
  );
}

export function Vide({ titre, texte, action }: { titre: string; texte?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-dashed border-bordure bg-white px-6 py-12 text-center">
      <p className="text-base font-medium">{titre}</p>
      {texte && <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{texte}</p>}
      {action && (
        <Link href={action.href} className={`${boutonPlein} mt-4`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Erreur({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function Succes({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {children}
    </p>
  );
}

export function Alerte({ children, action }: { children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#78350f]">
      <span className="flex-1">{children}</span>
      {action && (
        <Link href={action.href} className="underline underline-offset-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}
