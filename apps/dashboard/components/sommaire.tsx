"use client";

import { useEffect, useRef, useState } from "react";
import { useDeclarerSections } from "./contexte-sommaire";
import { estChampDeSaisie, sectionDeTouche, type SectionSommaire } from "@/lib/raccourcis";

/**
 * « Sur cette page » : pastille fixe en bas à droite listant les sections avec leur touche (1..9, j / k).
 * Chaque section de la page porte l'`id` correspondant ; le focus suit le défilement pour les lecteurs d'écran.
 */
export function Sommaire({ sections }: { sections: SectionSommaire[] }) {
  const [courante, setCourante] = useState(0);
  const courantRef = useRef(0);
  courantRef.current = courante;
  const declarer = useDeclarerSections();
  const cle = sections.map((section) => `${section.id}:${section.label}`).join("|");

  // L'aide `?` liste les raccourcis de la page courante : on les déclare à l'arrivée et on les retire au départ.
  useEffect(() => {
    declarer(sections);
    return () => declarer([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cle` résume le contenu de `sections`
  }, [cle, declarer]);

  useEffect(() => {
    const observateur = new IntersectionObserver(
      (entrees) => {
        const visible = entrees.filter((entree) => entree.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const index = sections.findIndex((section) => section.id === visible.target.id);
          if (index >= 0) setCourante(index);
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observateur.observe(element);
    }
    return () => observateur.disconnect();
  }, [sections]);

  const aller = (index: number) => {
    const section = sections[index];
    const element = section && document.getElementById(section.id);
    if (!element) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
    // Le focus suit la section : un lecteur d'écran annonce où l'on arrive, sans second défilement.
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    setCourante(index);
  };

  useEffect(() => {
    const touche = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || estChampDeSaisie(event.target as HTMLElement | null)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      const index = sectionDeTouche(event.key, sections, courantRef.current);
      if (index !== null) {
        event.preventDefault();
        aller(index);
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `aller` ne dépend que des sections
  }, [sections]);

  if (sections.length < 2) return null;
  return (
    <>
      {/* Réserve sous le contenu : la pastille fixe ne doit jamais recouvrir la dernière ligne d'un tableau. */}
      <div aria-hidden className="hidden h-24 sm:block" />
      <nav aria-label="Sur cette page" className="fixed bottom-4 right-4 z-30 hidden rounded-xl border border-bordure bg-white/95 p-1.5 text-xs shadow-lg backdrop-blur sm:block">
      <p className="px-2 pb-1 pt-0.5 font-medium text-zinc-400">Sur cette page</p>
      <ul>
        {sections.slice(0, 9).map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => aller(index)}
              aria-current={index === courante ? "true" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition ${index === courante ? "bg-indigo-50 font-medium text-indigo-texte" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-bordure bg-white px-1 font-sans text-[10px] font-medium text-zinc-500">{index + 1}</kbd>
              <span className="truncate">{section.label}</span>
            </button>
          </li>
        ))}
      </ul>
      </nav>
    </>
  );
}
