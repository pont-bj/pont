import { PontError } from "./errors.js";
import type { Country } from "./types.js";

/** Indicatif et longueur du numéro national. Bénin : 10 chiffres depuis le 2024-11-30 (préfixe 01). */
const PLANS: Record<Country, { code: string; nationalLength: number }> = {
  BJ: { code: "229", nationalLength: 10 },
  TG: { code: "228", nationalLength: 8 },
  CI: { code: "225", nationalLength: 10 },
  SN: { code: "221", nationalLength: 9 },
  BF: { code: "226", nationalLength: 8 },
  ML: { code: "223", nationalLength: 8 },
  NE: { code: "227", nationalLength: 8 },
  GN: { code: "224", nationalLength: 9 },
  CM: { code: "237", nationalLength: 9 },
  CG: { code: "242", nationalLength: 9 },
  CD: { code: "243", nationalLength: 9 },
  GA: { code: "241", nationalLength: 8 },
};

export interface NormalizedPhone {
  /** `+22901970000001` */
  e164: string;
  /** `22901970000001`, format MSISDN attendu par PawaPay. */
  msisdn: string;
  /** Partie nationale sans indicatif. */
  national: string;
  countryCode: string;
}

/**
 * Normalise un numéro saisi librement (`01 97 00 00 01`, `+229…`, `00229…`).
 * Un numéro béninois à 8 chiffres (ancien format) est refusé plutôt que corrigé silencieusement.
 */
export function normalizePhone(raw: string, country: Country, options: { allowLegacyBenin?: boolean } = {}): NormalizedPhone {
  const plan = PLANS[country];
  let digits = raw.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) {
    throw new PontError("invalid_phone", `« ${raw} » contient des caractères non numériques.`);
  }

  let national = digits;
  if (digits.length === plan.code.length + plan.nationalLength && digits.startsWith(plan.code)) {
    national = digits.slice(plan.code.length);
  }

  // Les numéros de test PawaPay du Bénin sont à 8 chiffres (`22951345789`) : toléré en sandbox uniquement.
  if (country === "BJ" && options.allowLegacyBenin) {
    if (digits.length === 11 && digits.startsWith(plan.code)) national = digits.slice(plan.code.length);
    if (national.length === 8) return { e164: `+${plan.code}${national}`, msisdn: `${plan.code}${national}`, national, countryCode: plan.code };
  }

  if (national.length !== plan.nationalLength) {
    const fix =
      country === "BJ" && national.length === 8
        ? "Au Bénin, les numéros ont 10 chiffres depuis le 30/11/2024 : ajoutez le préfixe 01."
        : undefined;
    throw new PontError(
      "invalid_phone",
      `${country} attend ${plan.nationalLength} chiffres après l'indicatif +${plan.code}.`,
      fix,
    );
  }

  return {
    e164: `+${plan.code}${national}`,
    msisdn: `${plan.code}${national}`,
    national,
    countryCode: plan.code,
  };
}
