"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

const input = "w-full rounded-lg border border-bordure bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100";

export function FormulaireDestinataire({ action }: { action: (state: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="grid gap-3 rounded-2xl border border-bordure bg-white p-5">
      <h2 className="text-lg font-semibold">Nouveau destinataire</h2>
      <p className="text-sm text-zinc-500">Pont envoie chaque événement (paiement réussi, retrait terminé…) à cette adresse, signé avec un secret propre au destinataire.</p>
      <div className="flex flex-wrap gap-3">
        <input name="url" type="url" required placeholder="https://mon-app.exemple/api/pont" className={`${input} min-w-0 flex-1`} aria-label="Adresse du destinataire" />
        <button disabled={pending} className="rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
          {pending ? "Ajout…" : "Ajouter"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.secret && (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p className="font-medium">{state.message}</p>
          <p className="mt-1">Copiez ce secret maintenant, il ne sera plus affiché :</p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 select-all">{state.secret}</code>
        </div>
      )}
    </form>
  );
}
