import { describe, expect, it } from "vitest";
import {
  PontError,
  canTransition,
  createPaymentSchema,
  hmacSha256Hex,
  normalizePhone,
  signPontWebhook,
  verifyPontWebhook,
  verifyTimestampedHmac,
} from "../src/index.js";

describe("normalizePhone", () => {
  it("normalise un numéro béninois à 10 chiffres sous plusieurs formes", () => {
    for (const raw of ["0197000001", "+229 01 97 00 00 01", "00229 0197000001", "229-01-97-00-00-01"]) {
      expect(normalizePhone(raw, "BJ")).toMatchObject({ e164: "+2290197000001", msisdn: "2290197000001", national: "0197000001" });
    }
  });

  it("refuse l'ancien format béninois à 8 chiffres avec un correctif", () => {
    try {
      normalizePhone("97000001", "BJ");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PontError);
      expect((error as PontError).code).toBe("invalid_phone");
      expect((error as PontError).fix).toContain("01");
    }
  });

  it("refuse les caractères non numériques", () => {
    expect(() => normalizePhone("77abc1234", "SN")).toThrow(PontError);
  });

  it("gère le Sénégal (9 chiffres)", () => {
    expect(normalizePhone("77 123 45 67", "SN").e164).toBe("+221771234567");
  });
});

describe("signatures Pont", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';

  it("accepte une signature valide et récente", () => {
    const header = signPontWebhook(secret, body, 1_000);
    expect(verifyPontWebhook(secret, body, header, { now: 1_100 })).toBe(true);
  });

  it("rejette un corps modifié, un mauvais secret, un en-tête absent", () => {
    const header = signPontWebhook(secret, body, 1_000);
    expect(verifyPontWebhook(secret, '{"id":"evt_2"}', header, { now: 1_000 })).toBe(false);
    expect(verifyPontWebhook("autre", body, header, { now: 1_000 })).toBe(false);
    expect(verifyPontWebhook(secret, body, null, { now: 1_000 })).toBe(false);
  });

  it("rejette un rejeu hors tolérance", () => {
    const header = signPontWebhook(secret, body, 1_000);
    expect(verifyPontWebhook(secret, body, header, { now: 1_000 + 301 })).toBe(false);
  });

  it("vérifie le format FedaPay t=…,s=… (HMAC-SHA256 de `t.body`)", () => {
    const header = `t=1000,s=${hmacSha256Hex("fp_secret", `1000.${body}`)}`;
    expect(verifyTimestampedHmac({ secret: "fp_secret", rawBody: body, header, scheme: "s", toleranceSeconds: 300, now: 1_200 })).toBe(true);
    expect(verifyTimestampedHmac({ secret: "fp_secret", rawBody: body, header, scheme: "v1", toleranceSeconds: 300, now: 1_200 })).toBe(false);
  });
});

describe("machine d'états", () => {
  it("interdit de sortir d'un état final", () => {
    expect(canTransition("failed", "succeeded")).toBe(false);
    expect(canTransition("expired", "succeeded")).toBe(false);
    expect(canTransition("pending", "succeeded")).toBe(true);
    expect(canTransition("succeeded", "refunded")).toBe(true);
  });
});

describe("createPaymentSchema", () => {
  const valid = { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "0197000001" }, reference: "order_1" };

  it("accepte une requête valide", () => {
    expect(createPaymentSchema.safeParse(valid).success).toBe(true);
  });

  it("refuse un montant décimal, négatif, et les champs inconnus", () => {
    expect(createPaymentSchema.safeParse({ ...valid, amount: 10.5 }).success).toBe(false);
    expect(createPaymentSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
    expect(createPaymentSchema.safeParse({ ...valid, provider_fee: 1 }).success).toBe(false);
  });
});
