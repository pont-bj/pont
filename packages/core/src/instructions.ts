import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";

// Instructions signées du dashboard Pont vers le backend du marchand (ADR-001, R-020).
// Pont signe avec sa clé privée Ed25519 ; le marchand vérifie avec la clé publique de Pont
// puis exécute avec SES clés d'agrégateur. Pont ne touche jamais une clé d'agrégateur.

export const instructionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("refund"),
    paymentId: z.string().min(1),
    amount: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("payout"),
    payout: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("resend_webhook"),
    deliveryId: z.string().min(1),
  }),
]);

export const signedInstructionSchema = z
  .object({
    /** Nonce unique : une instruction ne s'exécute qu'une fois. */
    id: z.string().min(16).max(128),
    /** Compte Pont émetteur : le marchand n'accepte que le sien. */
    accountId: z.string().min(1),
    /** Membre du dashboard à l'origine de l'instruction (journal d'audit). */
    issuedBy: z.string().min(1),
    issuedAt: z.number().int(),
    instruction: instructionSchema,
  })
  .strict();

export type Instruction = z.infer<typeof instructionSchema>;
export type SignedInstructionPayload = z.infer<typeof signedInstructionSchema>;

export interface SignedInstruction {
  payload: string;
  /** Signature Ed25519 du `payload`, en base64. */
  signature: string;
}

/** Côté cloud Pont. */
export function signInstruction(privateKeyPem: string, payload: SignedInstructionPayload): SignedInstruction {
  const body = JSON.stringify(signedInstructionSchema.parse(payload));
  return { payload: body, signature: sign(null, Buffer.from(body, "utf8"), createPrivateKey(privateKeyPem)).toString("base64") };
}

export type InstructionCheck =
  | { valid: true; payload: SignedInstructionPayload }
  | { valid: false; reason: string };

/** Côté marchand : signature, schéma, compte et fraîcheur. L'usage unique et le périmètre sont vérifiés par l'exécuteur. */
export function verifyInstruction(
  publicKeyPem: string,
  signed: SignedInstruction,
  options: { accountId: string; nowMs: number; toleranceMs?: number },
): InstructionCheck {
  let signatureOk = false;
  try {
    signatureOk = verify(null, Buffer.from(signed.payload, "utf8"), createPublicKey(publicKeyPem), Buffer.from(signed.signature, "base64"));
  } catch {
    return { valid: false, reason: "signature illisible" };
  }
  if (!signatureOk) return { valid: false, reason: "signature invalide" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(signed.payload);
  } catch {
    return { valid: false, reason: "contenu illisible" };
  }
  const result = signedInstructionSchema.safeParse(parsed);
  if (!result.success) return { valid: false, reason: "instruction non conforme" };
  if (result.data.accountId !== options.accountId) return { valid: false, reason: "compte inattendu" };
  if (Math.abs(options.nowMs - result.data.issuedAt) > (options.toleranceMs ?? 300_000)) return { valid: false, reason: "instruction expirée" };
  return { valid: true, payload: result.data };
}
