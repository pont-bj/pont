import { redirect } from "next/navigation";
import { hasAdmin } from "@/lib/auth";
import { creerAdministrateur } from "../actions";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireAuth } from "@/components/formulaire-auth";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (await hasAdmin()) redirect("/login");
  return (
    <CarteAuth titre="Bienvenue sur Pont" texte="Créez le compte administrateur de cette instance. Il n'y a pas d'autre inscription possible.">
      <FormulaireAuth action={creerAdministrateur} submit="Créer le compte" withName />
    </CarteAuth>
  );
}
