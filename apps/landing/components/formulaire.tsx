"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState, useEffect, useState } from "react";
import { ChoixRole } from "./choix-role";
import { inscrire, type EtatInscription } from "@/app/actions/inscrire";

const ROLES = [
  { valeur: "developpeur", libelle: "Développeur" },
  { valeur: "fondateur", libelle: "Fondateur de fintech" },
  { valeur: "agence", libelle: "Agence" },
  { valeur: "autre", libelle: "Autre" },
] as const;

export function Formulaire({ sombre = false, id }: { sombre?: boolean; id: string }) {
  const [etat, action, enCours] = useActionState<EtatInscription, FormData>(inscrire, { statut: "repos" });
  const [source, setSource] = useState("");
  const [copie, setCopie] = useState(false);
  const [saisie, setSaisie] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSource(p.get("utm_source") ?? p.get("ref") ?? "");
  }, []);

  if (etat.statut === "inscrit" || etat.statut === "deja") {
    const lien = typeof window === "undefined" ? "" : `${window.location.origin}/?ref=partage`;
    return (
      <div className={`w-full max-w-[520px] rounded-2xl p-6 text-left ${sombre ? "bg-white/10 text-white" : "border border-bordure bg-white shadow-sm"}`} role="status">
        <p className="font-titre text-xl font-semibold">
          {etat.statut === "inscrit" ? "Vous êtes sur la liste 🎉" : "Vous étiez déjà inscrit."}
        </p>
        <p className={`mt-1 text-sm ${sombre ? "text-indigo-100" : "text-zinc-600"}`}>
          Position <strong>n° {etat.position}</strong>. Les premiers inscrits ont accès en priorité.
        </p>
        <button
          type="button"
          onClick={async () => {
            const texte = "Pont : une seule intégration pour FedaPay, PawaPay, PayDunya et Kkiapay.";
            if (navigator.share) await navigator.share({ title: "Pont", text: texte, url: lien }).catch(() => undefined);
            else { await navigator.clipboard.writeText(lien); setCopie(true); }
          }}
          className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium ${sombre ? "bg-white text-encre" : "bg-encre text-white"}`}
        >
          {copie ? "Lien copié" : "Partager avec un dev"}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="w-full max-w-[520px]" aria-describedby={`${id}-aide`}>
      <div className={`flex flex-col gap-2 rounded-xl p-1.5 sm:flex-row sm:items-center ${sombre ? "bg-white" : "border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(79,70,229,0.06)]"}`}>
        <label htmlFor={`${id}-email`} className="sr-only">Adresse email</label>
        <input
          id={`${id}-email`} name="email" type="email" required autoComplete="email" inputMode="email"
          placeholder="votre@email.com"
          onChange={(e) => setSaisie(e.target.value.length > 0)}
          className="min-w-0 flex-1 rounded-lg px-3 py-3 text-[15px] outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-indigo"
        />
        <ChoixRole nom="role" options={ROLES} defaut="developpeur" />
        <button
          type="submit" disabled={enCours}
          className={`rounded-lg px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${sombre ? "bg-encre hover:bg-zinc-800" : "bg-indigo hover:bg-indigo-fonce"}`}
        >
          {enCours ? "Inscription…" : "Rejoindre la liste"}
        </button>
      </div>
      <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input type="hidden" name="source" value={source} />
      <AnimatePresence initial={false}>
        {(saisie || etat.statut === "erreur") && (
          <motion.div
            initial={{ height: 0, opacity: 0, filter: "blur(4px)" }}
            animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
      <label id={`${id}-aide`} className={`pt-3 flex items-start gap-2 text-left text-xs ${sombre ? "text-indigo-100" : "text-zinc-500"}`}>
        <input type="checkbox" name="consentement" required className="mt-0.5 accent-indigo" />
        <span>J&apos;accepte d&apos;être contacté par email au sujet de Pont. Désinscription en un clic, aucune revente de données.</span>
      </label>
          </motion.div>
        )}
      </AnimatePresence>
      {etat.statut === "erreur" && <p className={`mt-2 text-sm ${sombre ? "text-white" : "text-red-600"}`} role="alert">{etat.message}</p>}
    </form>
  );
}
