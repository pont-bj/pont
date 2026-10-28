import Link from "next/link";
import type { ReactNode } from "react";

/** Grille des tableaux de la maquette : Client | Référence | Montant | Statut | Date, écart de 24 px. */
export const GRILLE = "grid grid-cols-[minmax(0,1fr)_150px_130px_140px_110px] items-center gap-6 px-6";

export function Tableau({ entetes, children, pied }: { entetes: string[]; children: ReactNode; pied?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-bordure bg-white py-1">
      <div className="min-w-[780px]">
        <div className={`${GRILLE} h-9 text-xs font-medium text-zinc-400`}>
          {entetes.map((entete, index) => (
            <span key={entete} className={index === 2 || index === 4 ? "text-right" : ""}>
              {entete}
            </span>
          ))}
        </div>
        {children}
      </div>
      {pied}
    </div>
  );
}

export function Ligne({ href, principal, secondaire, ton = "normal", reference, montant, statut, date }: { href?: string; principal: string; secondaire: ReactNode; ton?: "normal" | "erreur"; reference: string; montant: string; statut: ReactNode; date: string }) {
  const contenu = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-medium">{principal}</span>
        <span className={`truncate text-xs ${ton === "erreur" ? "text-[#b91c1c]" : "text-zinc-400"}`}>{secondaire}</span>
      </span>
      <span className="truncate text-sm text-zinc-500" title={reference}>
        {reference}
      </span>
      <span className="text-right text-base font-medium tabular-nums">{montant}</span>
      <span>{statut}</span>
      <span className="text-right text-sm text-zinc-400">{date}</span>
    </>
  );
  const classes = `${GRILLE} h-14 border-t border-ligne transition`;
  return href ? (
    <Link href={href} className={`${classes} hover:bg-zinc-50/70 focus-visible:bg-zinc-50`}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}
