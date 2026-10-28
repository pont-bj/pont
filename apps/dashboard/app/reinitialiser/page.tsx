import Link from "next/link";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireOubli } from "@/components/formulaire-oubli";
import { reinitialiserMotDePasse } from "../actions";

export const dynamic = "force-dynamic";

export default async function Reinitialiser({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const valide = Boolean(token) && !error;
  return (
    <CarteAuth titre="Nouveau mot de passe" texte="Choisissez un mot de passe d'au moins 12 caractères.">
      {valide ? (
        <FormulaireOubli action={reinitialiserMotDePasse} mode="motdepasse" token={token} />
      ) : (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700">
          Ce lien est invalide ou expiré.{" "}
          <Link href="/mot-de-passe-oublie" className="underline">
            Refaire une demande
          </Link>
        </p>
      )}
    </CarteAuth>
  );
}
