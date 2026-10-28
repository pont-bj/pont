"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

interface Props {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: string;
  withName?: boolean;
}

const input = "w-full rounded-lg border border-bordure bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100";

export function FormulaireAuth({ action, submit, withName }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {withName && (
        <label className="block text-sm font-medium">
          Nom
          <input name="name" required autoComplete="name" className={`${input} mt-1.5`} />
        </label>
      )}
      <label className="block text-sm font-medium">
        Adresse e-mail
        <input name="email" type="email" required autoComplete="email" className={`${input} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium">
        Mot de passe
        <input name="password" type="password" required minLength={withName ? 12 : 1} autoComplete={withName ? "new-password" : "current-password"} className={`${input} mt-1.5`} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="w-full rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
        {pending ? "Patientez…" : submit}
      </button>
    </form>
  );
}
