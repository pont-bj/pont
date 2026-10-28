import Link from "next/link";
import { Coque } from "@/components/coque";
import { FormulaireEmail } from "@/components/formulaire-email";
import { getEmail, getShell } from "@/lib/pont";
import { propsCoque } from "@/lib/page";
import { requirePermission } from "@/lib/session";
import { enregistrerEmail, envoyerEmailTest, supprimerEmail } from "../actions";

export const dynamic = "force-dynamic";

export default async function Email() {
  const session = await requirePermission("parametres", "lire");
  const [shell, config] = await Promise.all([getShell(), getEmail().catch(() => null)]);
  const peutGerer = Boolean(config) && session.roles.can(session.user.role, "parametres", "gerer");
  return (
    <Coque actif="/email" titre="Paramètres" {...propsCoque(session, shell)}>
      <p className="-mt-2 text-sm text-zinc-500">Votre serveur SMTP envoie le mot de passe oublié et les <Link href="/alertes" className="font-medium text-indigo-fonce hover:underline">alertes</Link>. Le mot de passe est chiffré et ne s'affiche plus.</p>
      {!config ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Le coffre est désactivé : ajoutez <code className="rounded bg-white px-1.5 py-0.5">PONT_ENCRYPTION_KEY</code> (<code className="rounded bg-white px-1.5 py-0.5">openssl rand -hex 32</code>) à la configuration du serveur pour configurer le SMTP ici.
        </p>
      ) : (
        <>
          <p className={`inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${config.configured ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{config.configured ? "SMTP configuré" : "Pas de SMTP : aucun e-mail n'est envoyé"}</p>
          <FormulaireEmail config={config} enregistrer={enregistrerEmail} tester={envoyerEmailTest} supprimer={supprimerEmail} peutGerer={peutGerer} />
        </>
      )}
    </Coque>
  );
}
