import { seDeconnecter } from "../actions";
import { CarteAuth } from "@/components/carte-auth";

export const dynamic = "force-dynamic";

export default function AccesRefuse() {
  return (
    <CarteAuth titre="Accès refusé" texte="Votre rôle n'a pas la permission d'ouvrir cette page. Demandez à un administrateur de l'ajuster.">
      <form action={seDeconnecter}>
        <button className="w-full rounded-lg border border-bordure px-3.5 py-2 text-sm font-medium transition hover:bg-zinc-50">Se déconnecter</button>
      </form>
    </CarteAuth>
  );
}
