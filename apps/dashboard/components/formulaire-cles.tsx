"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import type { ProviderView } from "@/lib/pont";
import { ProviderLogo } from "./logos";

const input = "w-full rounded-lg border border-bordure bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100";

interface Props {
  provider: ProviderView;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  supprimer: (form: FormData) => Promise<void>;
  peutGerer: boolean;
}

/** Les secrets ne sont jamais relus : seul un masque (`••••1234`) s'affiche, un champ vide garde la valeur enregistrée. */
/** Les plugins déclarent des noms de clés bruts (`apiKey`, `merchant_id`) : on les rend lisibles. */
const lisible = (libelle: string) => {
  const texte = libelle.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};

export function FormulaireCles({ provider, action, supprimer, peutGerer }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <div id={`cle-${provider.id}`} className="scroll-mt-20 rounded-2xl border border-bordure bg-white p-5 outline-none">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold">
          <ProviderLogo id={provider.id} label={provider.label} hauteur={22} grise={!provider.configured} />
          {provider.custom && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-texte">Personnalisé</span>}
        </h2>
        {provider.configured ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Actif · {provider.source === "vault" ? "coffre" : "variables d'environnement"}</span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Non configuré</span>
        )}
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        URL de webhook à déclarer chez {provider.label} : <code className="rounded bg-zinc-100 px-1.5 py-0.5 break-all">{provider.webhookUrl}</code>
      </p>
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="provider" value={provider.id} />
        {provider.fields.map((field) => (
          <label key={field.name} className="grid gap-1 text-sm">
            <span className="font-medium">
              {provider.custom ? lisible(field.label) : field.label}
              {field.required ? "" : " (optionnel)"}
            </span>
            <input
              name={field.name}
              type={field.secret ? "password" : "text"}
              autoComplete="off"
              disabled={!peutGerer}
              placeholder={field.set ? `${field.value} · laisser vide pour conserver` : "À renseigner"}
              defaultValue={!field.secret && field.set && provider.source === "vault" ? (field.value ?? "") : ""}
              className={input}
            />
          </label>
        ))}
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {state.error}
          </p>
        )}
        {state.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 sm:col-span-2">{state.message}</p>}
        {peutGerer && (
          <div className="flex gap-3 sm:col-span-2">
            <button disabled={pending} className="rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </form>
      {peutGerer && provider.source === "vault" && (
        <form action={supprimer} className="mt-3">
          <input type="hidden" name="provider" value={provider.id} />
          <button className="text-sm text-red-600 hover:underline">Supprimer ces clés du coffre</button>
        </form>
      )}
    </div>
  );
}
