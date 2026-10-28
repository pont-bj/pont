"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

const input = "w-full rounded-lg border border-bordure bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100";

interface Props {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  /** `email` : demande de lien ; `motdepasse` : nouveau mot de passe (le jeton vient du lien reçu). */
  mode: "email" | "motdepasse";
  token?: string;
}

export function FormulaireOubli({ action, mode, token }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {mode === "email" ? (
        <label className="block text-sm font-medium">
          Adresse e-mail
          <input name="email" type="email" required autoComplete="email" className={`${input} mt-1.5`} />
        </label>
      ) : (
        <>
          <input type="hidden" name="token" value={token} />
          <label className="block text-sm font-medium">
            Nouveau mot de passe
            <input name="password" type="password" required minLength={12} autoComplete="new-password" className={`${input} mt-1.5`} />
          </label>
        </>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
        {pending ? "Patientez…" : mode === "email" ? "Envoyer le lien" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
