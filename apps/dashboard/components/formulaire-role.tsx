"use client";

import { useActionState, useState } from "react";
import { ACTION_LABELS, RESOURCES, RESOURCE_NAMES, type RoleDefinition } from "@pont-bj/auth";
import type { FormState } from "@/app/actions";

const input = "rounded-lg border border-bordure bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo-100";

interface Props {
  save: (state: FormState, form: FormData) => Promise<FormState>;
  remove?: (state: FormState, form: FormData) => Promise<FormState>;
  name?: string;
  definition?: RoleDefinition;
  readOnly?: boolean;
}

export function FormulaireRole({ save, remove, name, definition, readOnly }: Props) {
  const [saveState, saveAction, saving] = useActionState(save, {});
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(remove ?? (async () => ({})), {});
  const [all, setAll] = useState(definition?.all === true);
  const isNew = name === undefined;
  const error = saveState.error ?? removeState.error;

  return (
    <div className="rounded-2xl border border-bordure bg-white p-5">
      <form action={saveAction} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Identifiant
            <input name="name" defaultValue={name} readOnly={!isNew} required placeholder="ex. tresorier" pattern="[a-z][a-z0-9_\-]*" className={`${input} mt-1.5 block ${isNew ? "" : "bg-zinc-50 text-zinc-500"}`} />
          </label>
          <label className="text-sm font-medium">
            Nom affiché
            <input name="label" defaultValue={definition?.label} placeholder="Trésorier" disabled={readOnly} className={`${input} mt-1.5 block`} />
          </label>
          <label className="text-sm font-medium">
            Palier KYC
            <input name="kycTier" defaultValue={definition?.kycTier} placeholder="basique" disabled={readOnly} className={`${input} mt-1.5 block w-32`} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" name="all" checked={all} onChange={(event) => setAll(event.target.checked)} disabled={readOnly || name === "admin"} className="h-4 w-4 accent-indigo" />
            Accès total
          </label>
        </div>

        {!all && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Ressource</th>
                  <th className="py-2 font-medium">Actions autorisées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {RESOURCE_NAMES.map((resource) => (
                  <tr key={resource}>
                    <td className="py-2 pr-4 font-medium">{RESOURCES[resource].label}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {RESOURCES[resource].actions.map((action) => (
                          <label key={action} className="flex items-center gap-1.5">
                            <input type="checkbox" name={`perm:${resource}:${action}`} defaultChecked={definition?.permissions[resource]?.includes(action) ?? false} disabled={readOnly} className="h-4 w-4 accent-indigo" />
                            {ACTION_LABELS[action] ?? action}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {!readOnly && (
          <div className="flex items-center gap-3">
            <button disabled={saving} className="rounded-lg bg-indigo px-3.5 py-[9px] text-sm font-medium text-white transition hover:bg-indigo-fonce disabled:opacity-60">
              {saving ? "Enregistrement…" : isNew ? "Créer le rôle" : "Enregistrer"}
            </button>
            {saveState.error === undefined && saving === false && !isNew && <span className="text-xs text-zinc-400">Les changements s'appliquent immédiatement.</span>}
          </div>
        )}
      </form>
      {!isNew && remove && !readOnly && name !== "admin" && (
        <form action={removeAction} className="mt-3 border-t border-bordure pt-3">
          <input type="hidden" name="name" value={name} />
          <button disabled={removing} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60">
            Supprimer ce rôle
          </button>
        </form>
      )}
    </div>
  );
}
