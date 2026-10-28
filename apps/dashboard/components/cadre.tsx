"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconeMenu, IconeRecherche } from "./icones";
import { AideRaccourcis, type GroupeRaccourcis } from "./aide-raccourcis";
import { Palette, type Commande } from "./palette";
import { ContexteSommaire } from "./contexte-sommaire";
import { DELAI_SEQUENCE_MS, cibleDeSequence, estChampDeSaisie, type CibleNavigation, type SectionSommaire } from "@/lib/raccourcis";

interface Props {
  sidebar: ReactNode;
  commandes: Commande[];
  /** Cibles des séquences « g puis … ». */
  navigation: CibleNavigation[];
  mode: "test" | "live";
  placeholder: string;
  children: ReactNode;
}

/**
 * Cadre de l'application : sidebar fixe de 224 px au-dessus de 1024 px, tiroir en dessous ; barre haute de 60 px
 * avec la recherche (⌘K, Ctrl+K ou /), l'aide `?` et la pastille de mode. Séquences « g puis lettre » pour changer de page.
 */
export function Cadre({ sidebar, commandes, navigation, mode, placeholder, children }: Props) {
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [aide, setAide] = useState(false);
  const [sectionsPage, setSectionsPage] = useState<SectionSommaire[]>([]);
  const chemin = usePathname();
  const routeur = useRouter();

  useEffect(() => setMenu(false), [chemin]);
  useEffect(() => {
    let attenteSequence: ReturnType<typeof setTimeout> | null = null;
    const finSequence = () => {
      if (attenteSequence) clearTimeout(attenteSequence);
      attenteSequence = null;
    };
    const touche = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((ouverte) => !ouverte);
        return;
      }
      if (event.key === "Escape") {
        setMenu(false);
        setAide(false);
        finSequence();
        return;
      }
      // Les raccourcis à une touche ne s'appliquent ni avec un modificateur (Ctrl+L, Alt+flèche… restent au navigateur),
      // ni dans un champ de saisie, ni quand une fenêtre modale est ouverte.
      if (event.ctrlKey || event.metaKey || event.altKey || estChampDeSaisie(event.target as HTMLElement | null)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      if (attenteSequence) {
        finSequence();
        const cible = cibleDeSequence(event.key, navigation);
        if (cible) {
          event.preventDefault();
          routeur.push(cible.href);
        }
        return;
      }
      if (event.key === "g") {
        attenteSequence = setTimeout(finSequence, DELAI_SEQUENCE_MS);
      } else if (event.key === "/") {
        event.preventDefault();
        setPalette(true);
      } else if (event.key === "?") {
        event.preventDefault();
        setAide(true);
      }
    };
    window.addEventListener("keydown", touche);
    return () => {
      window.removeEventListener("keydown", touche);
      finSequence();
    };
  }, [navigation, routeur]);

  const groupes: GroupeRaccourcis[] = [
    { titre: "Navigation", lignes: navigation.map((cible) => ({ touches: ["g", cible.touche], label: cible.label })) },
    {
      titre: "Recherche et aide",
      lignes: [
        { touches: ["/"], label: "Ouvrir la recherche" },
        { touches: ["⌘K"], label: "Ouvrir la recherche (Ctrl+K)" },
        { touches: ["?"], label: "Afficher cette aide" },
        { touches: ["Échap"], label: "Fermer la fenêtre ou le menu" },
      ],
    },
    {
      titre: "Sur cette page",
      lignes:
        sectionsPage.length < 2
          ? [{ touches: ["—"], label: "Cette page n'a qu'une section" }]
          : [
              ...sectionsPage.slice(0, 9).map((section, index) => ({ touches: [String(index + 1)], label: section.label })),
              { touches: ["j"], label: "Section suivante" },
              { touches: ["k"], label: "Section précédente" },
            ],
    },
  ];

  return (
    <ContexteSommaire.Provider value={setSectionsPage}>
    <div className="min-h-screen bg-white lg:pl-56">
      <aside
        id="navigation"
        className={`fixed inset-y-0 left-0 z-40 w-56 -translate-x-full border-r border-bordure bg-fond-lateral transition-transform duration-200 lg:translate-x-0 ${menu ? "translate-x-0 shadow-xl" : ""}`}
      >
        {sidebar}
      </aside>
      {menu && <button aria-label="Fermer le menu" onClick={() => setMenu(false)} className="fixed inset-0 z-30 bg-black/20 lg:hidden" />}

      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-bordure bg-white px-4 sm:px-10">
        <button aria-label="Ouvrir le menu" aria-expanded={menu} aria-controls="navigation" onClick={() => setMenu(true)} className="-ml-1 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden">
          <IconeMenu />
        </button>
        <button
          onClick={() => setPalette(true)}
          className="flex h-9 w-full max-w-[360px] items-center gap-2 rounded-lg bg-ligne px-3 text-left text-sm text-zinc-400 transition hover:bg-zinc-200/70"
        >
          <IconeRecherche className="shrink-0" />
          <span className="flex-1 truncate">{placeholder}</span>
          <kbd className="hidden font-sans text-xs font-medium sm:inline">⌘K</kbd>
        </button>
        <div className="flex-1" />
        <button onClick={() => setAide(true)} aria-label="Raccourcis clavier" title="Raccourcis clavier (?)" className="hidden h-7 w-7 items-center justify-center rounded-lg border border-bordure text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 sm:inline-flex">
          ?
        </button>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border py-[5px] pl-2.5 pr-3 text-xs font-medium ${mode === "test" ? "border-[#fde68a] bg-[#fffbeb] text-[#92400e]" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${mode === "test" ? "bg-[#d97706]" : "bg-emerald-600"}`} />
          {mode === "test" ? "Mode test" : "Mode live"}
        </span>
      </header>

      <main className="px-4 pb-10 pt-8 sm:px-10">
        <div className="mx-auto flex max-w-[1136px] flex-col gap-6">{children}</div>
      </main>
      <Palette ouverte={palette} fermer={() => setPalette(false)} commandes={commandes} />
      <AideRaccourcis ouverte={aide} fermer={() => setAide(false)} groupes={groupes} />
    </div>
    </ContexteSommaire.Provider>
  );
}
