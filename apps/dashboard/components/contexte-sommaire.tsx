"use client";

import { createContext, useContext } from "react";
import type { SectionSommaire } from "@/lib/raccourcis";

/** Le sommaire de la page courante se déclare ici : l'aide `?` y lit les raccourcis de la page. */
export const ContexteSommaire = createContext<(sections: SectionSommaire[]) => void>(() => {});
export const useDeclarerSections = () => useContext(ContexteSommaire);
