export type PontErrorCode =
  | "invalid_request"
  | "idempotency_conflict"
  | "amount_not_allowed"
  | "invalid_phone"
  | "no_provider_available"
  | "provider_rejected"
  | "payment_not_found"
  | "invalid_transition"
  | "invalid_signature"
  | "configuration_error";

const MESSAGES_FR: Record<PontErrorCode, string> = {
  invalid_request: "La requête est invalide.",
  idempotency_conflict: "Cette clé d'idempotence a déjà été utilisée avec un contenu différent.",
  amount_not_allowed: "Le montant n'est pas accepté par l'agrégateur choisi.",
  invalid_phone: "Le numéro de téléphone est invalide pour ce pays.",
  no_provider_available: "Aucun agrégateur connecté ne couvre ce pays, cet opérateur et cette opération.",
  provider_rejected: "L'agrégateur a refusé la demande.",
  payment_not_found: "Paiement introuvable.",
  invalid_transition: "Transition de statut interdite.",
  invalid_signature: "Signature de webhook invalide.",
  configuration_error: "Configuration invalide.",
};

export class PontError extends Error {
  readonly code: PontErrorCode;
  readonly messageFr: string;
  readonly fix: string | undefined;

  constructor(code: PontErrorCode, detail?: string, fix?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PontError";
    this.code = code;
    this.messageFr = detail ? `${MESSAGES_FR[code]} ${detail}` : MESSAGES_FR[code];
    this.fix = fix;
  }
}

export function isPontError(value: unknown): value is PontError {
  return value instanceof PontError;
}
