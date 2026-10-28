import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdmin } from "@/lib/auth";
import { emailConfigured } from "@/lib/pont";
import { seConnecter } from "../actions";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireAuth } from "@/components/formulaire-auth";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ reinitialise?: string }> }) {
  if (!(await hasAdmin())) redirect("/setup");
  const [{ reinitialise }, oubliPossible] = await Promise.all([searchParams, emailConfigured()]);
  return (
    <CarteAuth titre="Connexion" texte="Accédez au dashboard de votre instance Pont.">
      {reinitialise && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Mot de passe changé. Connectez-vous.</p>}
      <FormulaireAuth action={seConnecter} submit="Se connecter" />
      {oubliPossible && (
        <p className="mt-4 text-center text-sm">
          <Link href="/mot-de-passe-oublie" className="text-indigo hover:underline">
            Mot de passe oublié ?
          </Link>
        </p>
      )}
    </CarteAuth>
  );
}
