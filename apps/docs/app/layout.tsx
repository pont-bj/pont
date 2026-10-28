import "./global.css";
import { BASE_PATH } from "@/lib/base-path";
import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";

/** Interface de Fumadocs en français (les clés sont celles de `fumadocs-ui`). */
const traductions = {
  "Search(search trigger)": "Rechercher",
  "Search(search dialog)": "Rechercher",
  "Open Search(search trigger)(aria-label)": "Ouvrir la recherche",
  "Close Search(search dialog)(aria-label)": "Fermer la recherche",
  "No results found(search dialog)": "Aucun résultat",
  "On this page(table of contents)": "Sur cette page",
  "No Headings(table of contents)": "Aucun titre",
  "Next Page(pagination)": "Page suivante",
  "Previous Page(pagination)": "Page précédente",
  "Light(theme switcher)(aria-label)": "Thème clair",
  "Dark(theme switcher)(aria-label)": "Thème sombre",
  "System(theme switcher)(aria-label)": "Thème du système",
  "Toggle Theme(theme switcher)(aria-label)": "Changer de thème",
  "Toggle Menu(mobile menu)(aria-label)": "Ouvrir le menu",
  "Open Sidebar(sidebar)(aria-label)": "Ouvrir le menu latéral",
  "Close Sidebar(sidebar)(aria-label)": "Fermer le menu latéral",
  "Collapse Sidebar(sidebar)(aria-label)": "Réduire le menu latéral",
  "Hide Sidebar(sidebar)": "Masquer le menu latéral",
  "Show Sidebar(sidebar)": "Afficher le menu latéral",
  "Copy Text(code block)(aria-label)": "Copier",
  "Copied Text(code block)(aria-label)": "Copié",
  "Copy Anchor Link(heading anchor)(aria-label)": "Copier le lien du titre",
  "Copied Anchor Link(heading anchor)(aria-label)": "Lien copié",
  "Back to Home(404 page)": "Retour à l'accueil",
  "Page Not Found(404 page)": "Page introuvable",
  "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
    "La page que vous cherchez a peut-être été supprimée, renommée ou est momentanément indisponible.",
  "Table of Contents(inline table of contents)": "Sommaire",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Documentation Pont", template: "%s · Pont" },
  description: "Pont, le backend de ta fintech en un clic : paiements, portefeuilles, registre, rôles et webhooks pour l'Afrique francophone.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider
          search={{ options: { api: `${BASE_PATH}/api/search` } }}
          i18n={{ locale: "fr", translations: traductions }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
