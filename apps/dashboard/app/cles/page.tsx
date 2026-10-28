import { Coque } from "@/components/coque";
import { FormulaireCles } from "@/components/formulaire-cles";
import { AvertissementUrlPublique } from "@/components/avertissement-url";
import { ErreursPlugins } from "@/components/erreurs-plugins";
import { Sommaire } from "@/components/sommaire";
import { getShell, listProviders } from "@/lib/pont";
import { propsCoque } from "@/lib/page";
import { requirePermission } from "@/lib/session";
import { enregistrerCles, supprimerCles } from "../actions";

export const dynamic = "force-dynamic";

export default async function Cles() {
  const session = await requirePermission("cles", "lire");
  const [shell, { vault, data: providers, pluginErrors = [] }] = await Promise.all([getShell(), listProviders()]);
  const adressePublique = providers[0]?.webhookUrl.replace(/\/hooks\/[^/]+$/, "") ?? null;
  const peutGerer = vault && session.roles.can(session.user.role, "cles", "gerer");
  return (
    <Coque actif="/cles" titre="Développeurs" {...propsCoque(session, shell)}>
      <AvertissementUrlPublique adresse={adressePublique} />
      {pluginErrors.length > 0 && <ErreursPlugins erreurs={pluginErrors} />}
      <p className="-mt-2 text-sm text-zinc-500">Clés des agrégateurs, chiffrées (AES-256-GCM) sur votre serveur. Un secret enregistré ne s'affiche plus jamais en entier.</p>
      {!vault && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Le coffre est désactivé : ajoutez <code className="rounded bg-white px-1.5 py-0.5">PONT_ENCRYPTION_KEY</code> (<code className="rounded bg-white px-1.5 py-0.5">openssl rand -hex 32</code>) à la configuration du serveur pour saisir les clés ici. En attendant, les clés se lisent dans les variables d'environnement.
        </p>
      )}
      <div className="grid gap-4">
        {providers.map((provider) => (
          <FormulaireCles key={provider.id} provider={provider} action={enregistrerCles} supprimer={supprimerCles} peutGerer={peutGerer} />
        ))}
      </div>
      <p className="text-sm text-zinc-500">Kkiapay ne peut pas être combiné avec un autre agrégateur (CGU Art. 18) : Pont refuse cette combinaison.</p>
      <Sommaire sections={providers.map((provider) => ({ id: `cle-${provider.id}`, label: provider.label }))} />
    </Coque>
  );
}
