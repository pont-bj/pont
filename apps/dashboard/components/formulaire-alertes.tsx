"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import type { AlertsView } from "@/lib/pont";

const input = "w-full rounded-lg border border-bordure bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100 disabled:bg-zinc-50";

interface Props {
  alertes: AlertsView;
  enregistrer: (state: FormState, form: FormData) => Promise<FormState>;
  tester: () => Promise<FormState>;
  peutGerer: boolean;
}

export function FormulaireAlertes({ alertes, enregistrer, tester, peutGerer }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(enregistrer, {});
  const [testState, testAction, testing] = useActionState<FormState, FormData>(() => tester(), {});
  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-4 rounded-2xl border border-bordure bg-white p-5">
        <input type="hidden" name="ruleIds" value={alertes.rules.map((rule) => rule.id).join(",")} />
        <fieldset className="grid gap-3" disabled={!peutGerer}>
          <legend className="mb-1 text-lg font-semibold">Règles</legend>
          {alertes.rules.map((rule) => (
            <label key={rule.id} className="flex items-start gap-3 text-sm">
              <input type="checkbox" name={`rule:${rule.id}`} defaultChecked={rule.enabled} className="mt-1 h-4 w-4 accent-indigo" />
              <span>
                <span className="font-medium">{rule.label}</span>
                <span className="block text-zinc-500">{rule.description}</span>
              </span>
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Seuil du solde de transit (XOF)</span>
            <input name="lowBalanceThreshold" type="number" step={1} defaultValue={alertes.lowBalanceThreshold} className={`${input} max-w-48`} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Destinataires (un par ligne ou séparés par des virgules)</span>
            <textarea name="recipients" rows={3} defaultValue={alertes.recipients.join("\n")} placeholder="equipe@exemple.bj" className={input} />
          </label>
        </fieldset>
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
        {peutGerer && (
          <div>
            <button disabled={pending} className="rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </form>
      {peutGerer && alertes.emailConfigured && alertes.recipients.length > 0 && (
        <form action={testAction} className="flex flex-wrap items-center gap-3">
          <button disabled={testing} className="rounded-lg border border-bordure bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-zinc-50 disabled:opacity-60">
            {testing ? "Envoi…" : "Envoyer une alerte de test"}
          </button>
          {testState.error && <span role="alert" className="text-sm text-red-700">{testState.error}</span>}
          {testState.message && <span className="text-sm text-emerald-700">{testState.message}</span>}
        </form>
      )}
    </div>
  );
}
