"use client";

import { useActionState, useRef } from "react";
import type { FormState } from "@/app/actions";

const input = "w-full rounded-lg border border-bordure bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100";

interface Props {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  roles: { name: string; label: string }[];
}

export function FormulaireUtilisateur({ action, roles }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await action(previous, form);
    if (!result.error) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} action={formAction} className="grid gap-3 rounded-2xl border border-bordure bg-white p-5 sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">Nouvel utilisateur</h2>
      <input name="name" placeholder="Nom" required className={input} aria-label="Nom" />
      <input name="email" type="email" placeholder="Adresse e-mail" required className={input} aria-label="Adresse e-mail" />
      <input name="password" type="password" placeholder="Mot de passe (12 caractères min.)" required minLength={12} autoComplete="new-password" className={input} aria-label="Mot de passe" />
      <select name="role" required className={input} aria-label="Rôle" defaultValue="">
        <option value="" disabled>
          Rôle…
        </option>
        {roles.map((role) => (
          <option key={role.name} value={role.name}>
            {role.label}
          </option>
        ))}
      </select>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
          {pending ? "Création…" : "Créer l'utilisateur"}
        </button>
      </div>
    </form>
  );
}
