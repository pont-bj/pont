import { IconeAttention, IconeCoche, IconeCroix, IconeRetour, IconeRond } from "./icones";

type Ton = "ok" | "alerte" | "ko" | "neutre";

const TON: Record<Ton, string> = {
  ok: "bg-[#f0fdf4] text-[#15803d]",
  alerte: "bg-[#fffbeb] text-[#b45309]",
  ko: "bg-[#fef2f2] text-[#b91c1c]",
  neutre: "bg-[#f4f4f5] text-[#52525b]",
};

interface Style {
  label: string;
  ton: Ton;
  icone: "coche" | "attention" | "croix" | "rond" | "retour";
}

const PAIEMENT: Record<string, Style> = {
  succeeded: { label: "Réussi", ton: "ok", icone: "coche" },
  created: { label: "En attente", ton: "neutre", icone: "rond" },
  pending: { label: "En attente", ton: "neutre", icone: "rond" },
  processing: { label: "En cours", ton: "neutre", icone: "rond" },
  failed: { label: "Échoué", ton: "ko", icone: "croix" },
  expired: { label: "Expiré", ton: "neutre", icone: "croix" },
  cancelled: { label: "Annulé", ton: "neutre", icone: "croix" },
  refunded: { label: "Remboursé", ton: "neutre", icone: "retour" },
  partially_refunded: { label: "Remboursé en partie", ton: "neutre", icone: "retour" },
};

const RETRAIT: Record<string, Style> = {
  succeeded: { label: "Envoyé", ton: "ok", icone: "coche" },
  pending: { label: "En attente", ton: "neutre", icone: "rond" },
  processing: { label: "En cours", ton: "neutre", icone: "rond" },
  failed: { label: "Échoué", ton: "ko", icone: "croix" },
  cancelled: { label: "Annulé", ton: "neutre", icone: "croix" },
};

const ICONES = { coche: IconeCoche, attention: IconeAttention, croix: IconeCroix, rond: IconeRond, retour: IconeRetour };

/** Libellé affiché pour un statut de paiement, partagé par les filtres et l'export. */
export const libelleStatut = (status: string, aReconcilier = false) => (aReconcilier && status !== "succeeded" ? "À réconcilier" : (PAIEMENT[status]?.label ?? status));

export function Statut({ status, aReconcilier = false, retrait = false, grand = false }: { status: string; aReconcilier?: boolean; retrait?: boolean; grand?: boolean }) {
  // Un statut incertain prime : l'argent n'est ni confirmé ni perdu (jamais de nouvel essai tant qu'il n'est pas vérifié).
  const style: Style = aReconcilier && status !== "succeeded" ? { label: "À réconcilier", ton: "alerte", icone: "attention" } : ((retrait ? RETRAIT : PAIEMENT)[status] ?? { label: status, ton: "neutre", icone: "rond" });
  const Icone = ICONES[style.icone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${TON[style.ton]} ${grand ? "px-2.5 py-1 text-sm" : "py-[3px] pl-2 pr-2.5 text-xs"}`}>
      <Icone />
      {style.label}
    </span>
  );
}
