import Link from "next/link";
import type { Onglet } from "@/lib/navigation";

/** Onglets soulignés : actif = trait indigo de 2 px (maquette « Développeurs »). */
export function Onglets({ onglets, actif }: { onglets: Onglet[]; actif: string }) {
  return (
    <nav aria-label="Sections" className="-mt-1 flex gap-6 overflow-x-auto border-b border-bordure">
      {onglets.map((onglet) => {
        const courant = onglet.href === actif;
        return (
          <Link
            key={onglet.href}
            href={onglet.href}
            aria-current={courant ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-base font-medium transition ${courant ? "border-indigo text-indigo-texte" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {onglet.label}
          </Link>
        );
      })}
    </nav>
  );
}
