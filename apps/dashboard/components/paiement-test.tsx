import { lancerPaiementTest } from "@/app/actions";
import { boutonPlein, champ } from "./ui";

const SCENARIOS = [
  { value: "0000001", label: "Succès" },
  { value: "0000002", label: "Solde insuffisant" },
  { value: "0000003", label: "Jamais confirmé" },
  { value: "0000008", label: "Refusé par le client" },
];

/** Paiement de test (sandbox seulement) : le scénario est choisi par les 7 derniers chiffres du numéro. */
export function PaiementTest() {
  return (
    <form action={lancerPaiementTest} className="flex items-center gap-2">
      <select name="scenario" aria-label="Scénario de test" className={`${champ} w-auto! cursor-pointer appearance-none pr-9 bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3E%3Cpath d=%27M3 4.5l3 3 3-3%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%271.5%27 stroke-linecap=%27round%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat`}>
        {SCENARIOS.map((scenario) => (
          <option key={scenario.value} value={scenario.value}>
            {scenario.label}
          </option>
        ))}
      </select>
      <button className={boutonPlein}>Paiement de test</button>
    </form>
  );
}
