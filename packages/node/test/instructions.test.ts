import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signInstruction, type SignedInstructionPayload } from "@pont-bj/core";
import { MemoryIdempotencyStore } from "@pont-bj/engine";
import { createPontFromEnv, executeInstruction, type InstructionExecutorOptions } from "../src/index.js";

const pontKeys = generateKeyPairSync("ed25519");
const PRIVATE = pontKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PUBLIC = pontKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const NOW = 1_800_000_000_000;

async function paidSetup() {
  const engine = createPontFromEnv({ env: { PONT_SANDBOX: "true", PONT_PUBLIC_URL: "https://boutique.bj" } });
  const payment = await engine.createPayment({ amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "o1" }, "idem-instr");
  await engine.refreshPayment(payment.id);
  const options: InstructionExecutorOptions = {
    engine,
    pontPublicKey: PUBLIC,
    accountId: "acc_boutique",
    policy: { allow: ["refund"], maxAmount: 10_000 },
    nonces: new MemoryIdempotencyStore(),
    now: () => NOW,
  };
  return { engine, payment, options };
}

const payload = (overrides: Partial<SignedInstructionPayload> & Pick<SignedInstructionPayload, "instruction">): SignedInstructionPayload => ({
  id: randomUUID(),
  accountId: "acc_boutique",
  issuedBy: "user_francois",
  issuedAt: NOW,
  ...overrides,
});

describe("instructions signées du dashboard (R-020)", () => {
  it("exécute un remboursement autorisé, une seule fois", async () => {
    const { options, payment } = await paidSetup();
    // Le sandbox ne gère pas les remboursements : on vérifie le passage des contrôles jusqu'à l'agrégateur.
    const signed = signInstruction(PRIVATE, payload({ instruction: { type: "refund", paymentId: payment.id } }));
    expect(await executeInstruction(signed, options)).toMatchObject({ status: "failed", reason: expect.stringMatching(/remboursement/) });
    expect(await executeInstruction(signed, options)).toEqual({ status: "refused", reason: "instruction déjà utilisée" });
  });

  it("refuse : signature d'une autre clé, contenu modifié, autre compte, instruction expirée", async () => {
    const { options, payment } = await paidSetup();
    const other = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const base = payload({ instruction: { type: "refund", paymentId: payment.id } });

    expect(await executeInstruction(signInstruction(other, base), options)).toMatchObject({ reason: "signature invalide" });
    const signed = signInstruction(PRIVATE, base);
    expect(await executeInstruction({ ...signed, payload: signed.payload.replace("o1", "o2").replace(payment.id, "pay_autre") }, options)).toMatchObject({ reason: "signature invalide" });
    expect(await executeInstruction(signInstruction(PRIVATE, { ...base, id: randomUUID(), accountId: "acc_autre" }), options)).toMatchObject({ reason: "compte inattendu" });
    expect(await executeInstruction(signInstruction(PRIVATE, { ...base, id: randomUUID(), issuedAt: NOW - 600_000 }), options)).toMatchObject({ reason: "instruction expirée" });
  });

  it("refuse un type non autorisé et un montant au-delà du plafond", async () => {
    const { options } = await paidSetup();
    const payout = signInstruction(PRIVATE, payload({ instruction: { type: "payout", payout: { amount: 2000 } } }));
    expect(await executeInstruction(payout, options)).toMatchObject({ reason: "type non autorisé : payout" });

    const bigPayout = signInstruction(PRIVATE, payload({ instruction: { type: "payout", payout: { amount: 50_000 } } }));
    expect(await executeInstruction(bigPayout, { ...options, policy: { allow: ["payout"], maxAmount: 10_000 } })).toMatchObject({ reason: "montant au-delà du plafond" });
  });

  it("journalise chaque décision", async () => {
    const { options, payment } = await paidSetup();
    const audit: string[] = [];
    const signed = signInstruction(PRIVATE, payload({ instruction: { type: "refund", paymentId: "inconnu" } }));
    await executeInstruction(signed, { ...options, onAudit: (entry) => void audit.push(entry.outcome) });
    expect(audit).toEqual(["refusée : paiement inconnu"]);
    expect(payment.id).toBeTruthy();
  });
});
