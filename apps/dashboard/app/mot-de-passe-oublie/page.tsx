import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdmin } from "@/lib/auth";
import { emailConfigured } from "@/lib/pont";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireOubli } from "@/components/formulaire-oubli";
import { demanderReinitialisation } from "../actions";

export const dynamic = "force-dynamic";

export default async function MotDePasseOublie() {
  if (!(await hasAdmin())) redirect("/setup");
  const actif = await emailConfigured();
  return (
    <CarteAuth titre="Mot de passe oublié" texte="Saisissez votre adresse : si un compte existe, vous recevrez un lien pour choisir un nouveau mot de passe.">
      {actif ? (
        <FormulaireOubli action={demanderReinitialisation} mode="email" />
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">L'envoi d'e-mails n'est pas configuré sur cette instance. Demandez à un administrateur de réinitialiser votre mot de passe.</p>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-indigo hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </CarteAuth>
  );
}
