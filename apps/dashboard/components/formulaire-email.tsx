"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import type { EmailView } from "@/lib/pont";

const input = "w-full rounded-lg border border-bordure bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100 disabled:bg-zinc-50";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

function Retour({ state }: { state: FormState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 sm:col-span-2">{state.message}</p>}
    </>
  );
}

interface Props {
  config: EmailView;
  enregistrer: Action;
  tester: Action;
  supprimer: () => Promise<void>;
  peutGerer: boolean;
}

/** Le mot de passe SMTP n'est jamais relu : champ vide = valeur enregistrée conservée. */
export function FormulaireEmail({ config, enregistrer, tester, supprimer, peutGerer }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(enregistrer, {});
  const [testState, testAction, testing] = useActionState<FormState, FormData>(tester, {});
  return (
    <div className="grid gap-6">
      <form action={formAction} className="grid gap-3 rounded-2xl border border-bordure bg-white p-5 sm:grid-cols-2">
        <h2 className="text-lg font-semibold sm:col-span-2">Serveur SMTP</h2>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Hôte</span>
          <input name="host" required disabled={!peutGerer} defaultValue={config.host ?? ""} placeholder="smtp.exemple.bj" className={input} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Port</span>
            <input name="port" type="number" required disabled={!peutGerer} defaultValue={config.port ?? 587} className={input} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Sécurité</span>
            <select name="security" disabled={!peutGerer} defaultValue={config.security ?? "starttls"} className={input}>
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">TLS (465)</option>
              <option value="none">Aucune (réseau local)</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Utilisateur</span>
          <input name="user" autoComplete="off" disabled={!peutGerer} defaultValue={config.user ?? ""} className={input} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Mot de passe</span>
          <input name="password" type="password" autoComplete="new-password" disabled={!peutGerer} placeholder={config.passwordSet ? "•••• enregistré · laisser vide pour conserver" : ""} className={input} />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Expéditeur</span>
          <input name="from" required disabled={!peutGerer} defaultValue={config.from ?? ""} placeholder="Pont <contact@exemple.bj>" className={input} />
        </label>
        <Retour state={state} />
        {peutGerer && (
          <div className="sm:col-span-2">
            <button disabled={pending} className="rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </form>

      {config.configured && peutGerer && (
        <form action={testAction} className="grid gap-3 rounded-2xl border border-bordure bg-white p-5 sm:grid-cols-2">
          <h2 className="text-lg font-semibold sm:col-span-2">Tester l'envoi</h2>
          <input name="to" type="email" required placeholder="votre@adresse.bj" aria-label="Adresse du destinataire du test" className={input} />
          <div>
            <button disabled={testing} className="rounded-lg border border-bordure bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-zinc-50 disabled:opacity-60">
              {testing ? "Envoi…" : "Envoyer un e-mail de test"}
            </button>
          </div>
          <Retour state={testState} />
        </form>
      )}

      {config.configured && peutGerer && (
        <form action={supprimer}>
          <button className="text-sm text-red-600 hover:underline">Supprimer la configuration SMTP</button>
        </form>
      )}
    </div>
  );
}
