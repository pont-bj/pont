"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions";
import { IconeRetour } from "./icones";
import { boutonDanger, bouton, champ, Erreur, Succes } from "./ui";

/** Remboursement : confirmation en deux temps (jamais un clic isolé), total par défaut, montant partiel facultatif. */
export function FormulaireRemboursement({ action, id, devise, restant }: { action: (state: FormState, form: FormData) => Promise<FormState>; id: string; devise: string; restant: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  if (state.message && ouvert) setOuvert(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className={bouton}>
        <IconeRetour />
        Rembourser
      </button>
      {ouvert && (
        <form action={formAction} className="absolute right-0 top-full z-10 mt-2 grid w-80 gap-3 rounded-2xl border border-bordure bg-white p-4 shadow-xl">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-zinc-500">
            Remboursable jusqu'à <b className="text-encre">{new Intl.NumberFormat("fr-FR").format(restant)} {devise}</b>. Les frais d'agrégateur ne sont pas rendus.
          </p>
          <label className="grid gap-1 text-sm font-medium">
            Montant ({devise}), vide pour le total
            <input name="amount" inputMode="numeric" pattern="[0-9]*" placeholder="Total" className={champ} />
          </label>
          {state.error && <Erreur>{state.error}</Erreur>}
          <div className="flex gap-2">
            <button disabled={pending} className={boutonDanger}>
              {pending ? "Remboursement…" : "Confirmer le remboursement"}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className={bouton}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {state.message && !ouvert && (
        <div className="absolute right-0 top-full z-10 mt-2 w-80">
          <Succes>{state.message}</Succes>
        </div>
      )}
    </div>
  );
}
