"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconeRecherche } from "./icones";

export interface Commande {
  label: string;
  href: string;
  groupe: string;
}

interface Resultat {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
}

const sansAccent = (texte: string) => texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Palette de commandes : pages (filtrées par vos permissions) et paiements par référence ou identifiant. */
export function Palette({ ouverte, fermer, commandes }: { ouverte: boolean; fermer: () => void; commandes: Commande[] }) {
  const router = useRouter();
  const [requete, setRequete] = useState("");
  const [paiements, setPaiements] = useState<Resultat[]>([]);
  const [courant, setCourant] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ouverte) {
      setRequete("");
      setPaiements([]);
      setCourant(0);
      setTimeout(() => champ.current?.focus(), 0);
    }
  }, [ouverte]);

  useEffect(() => {
    if (!ouverte || requete.trim().length < 2) {
      setPaiements([]);
      return;
    }
    const controle = new AbortController();
    const minuterie = setTimeout(async () => {
      try {
        const reponse = await fetch(`/api/recherche?q=${encodeURIComponent(requete.trim())}`, { signal: controle.signal });
        if (reponse.ok) setPaiements(((await reponse.json()) as { data: Resultat[] }).data);
      } catch {
        /* requête annulée ou réseau coupé : la liste de pages reste utilisable */
      }
    }, 180);
    return () => {
      clearTimeout(minuterie);
      controle.abort();
    };
  }, [requete, ouverte]);

  const elements = useMemo(() => {
    const filtre = sansAccent(requete.trim());
    const pages = commandes.filter((commande) => filtre === "" || sansAccent(commande.label).includes(filtre));
    return [
      ...pages.map((commande) => ({ cle: commande.href, label: commande.label, aide: commande.groupe, href: commande.href })),
      ...paiements.map((paiement) => ({
        cle: paiement.id,
        label: paiement.reference,
        aide: `${new Intl.NumberFormat("fr-FR").format(paiement.amount)} ${paiement.currency} · ${paiement.id.slice(0, 12)}…`,
        href: `/paiements/${paiement.id}`,
      })),
    ];
  }, [requete, commandes, paiements]);

  if (!ouverte) return null;

  const aller = (href: string) => {
    fermer();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[15vh]" onMouseDown={(event) => event.target === event.currentTarget && fermer()}>
      <div role="dialog" aria-modal="true" aria-label="Recherche" className="w-full max-w-xl overflow-hidden rounded-2xl border border-bordure bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-bordure px-4">
          <IconeRecherche className="shrink-0 text-zinc-400" />
          <input
            ref={champ}
            value={requete}
            onChange={(event) => {
              setRequete(event.target.value);
              setCourant(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCourant((c) => Math.min(c + 1, elements.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCourant((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter" && elements[courant]) {
                aller(elements[courant].href);
              } else if (event.key === "Escape") {
                fermer();
              }
            }}
            placeholder="Aller à une page, chercher un paiement (référence, identifiant)…"
            aria-label="Rechercher"
            role="combobox"
            aria-expanded="true"
            aria-controls="resultats-palette"
            className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded border border-bordure px-1.5 py-0.5 text-xs text-zinc-400">Échap</kbd>
        </div>
        <ul id="resultats-palette" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {elements.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">Aucun résultat pour « {requete} ».</li>}
          {elements.map((element, index) => (
            <li key={element.cle} role="option" aria-selected={index === courant}>
              <button
                onMouseEnter={() => setCourant(index)}
                onClick={() => aller(element.href)}
                className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-base ${index === courant ? "bg-indigo-50 text-indigo-texte" : "text-zinc-700"}`}
              >
                <span className="truncate font-medium">{element.label}</span>
                <span className="shrink-0 text-xs text-zinc-400">{element.aide}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
