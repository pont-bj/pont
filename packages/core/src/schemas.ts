import { z } from "zod";

const COUNTRIES = ["BJ", "TG", "CI", "SN", "BF", "ML", "NE", "GN", "CM", "CG", "CD", "GA"] as const;
const OPERATORS = [
  "mtn_bj", "moov_bj", "celtiis_bj", "moov_tg", "tmoney_tg",
  "mtn_ci", "orange_ci", "moov_ci", "wave_ci",
  "orange_sn", "free_sn", "wave_sn", "expresso_sn", "wizall_sn",
  "orange_bf", "moov_bf", "orange_ml", "moov_ml",
  "mtn_cm", "orange_cm", "mtn_cg", "airtel_cg", "airtel_ga",
] as const;

/** Validation à la frontière pour `POST /payments`. R-002, R-007 */
export const createPaymentSchema = z
  .object({
    amount: z.number().int("Le montant doit être un entier (XOF/XAF sans décimales).").positive(),
    currency: z.enum(["XOF", "XAF"]),
    country: z.enum(COUNTRIES),
    customer: z.object({
      phone: z.string().min(6).max(20),
      name: z.string().max(120).optional(),
      email: z.string().email().optional(),
    }),
    method: z.enum(["mobile_money", "card"]).optional(),
    operator: z.enum(OPERATORS).optional(),
    reference: z.string().min(1).max(64),
    description: z.string().max(255).optional(),
    returnUrl: z.string().url().optional(),
    metadata: z.record(z.string().max(500)).optional(),
    preAuthorisationCode: z.string().regex(/^[A-Za-z0-9]{1,36}$/, "Code de préautorisation : 1 à 36 caractères alphanumériques.").optional(),
  })
  .strict();

export const idempotencyKeySchema = z.string().min(8).max(255);

/** Validation à la frontière pour `POST /payouts`. L'opérateur est obligatoire (aucun agrégateur ne le devine de façon fiable). */
export const createPayoutSchema = z
  .object({
    amount: z.number().int("Le montant doit être un entier (XOF/XAF sans décimales).").positive(),
    currency: z.enum(["XOF", "XAF"]),
    country: z.enum(COUNTRIES),
    operator: z.enum(OPERATORS),
    recipient: z.object({
      phone: z.string().min(6).max(20),
      name: z.string().max(120).optional(),
      email: z.string().email().optional(),
    }),
    reference: z.string().min(1).max(64),
    description: z.string().max(255).optional(),
    metadata: z.record(z.string().max(500)).optional(),
  })
  .strict();

export const createRefundSchema = z
  .object({
    amount: z.number().int().positive().optional(),
  })
  .strict();
