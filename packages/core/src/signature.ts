import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Comparaison à temps constant de deux chaînes. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function sha512Hex(value: string): string {
  return createHash("sha512").update(value, "utf8").digest("hex");
}

export const PONT_SIGNATURE_HEADER = "pont-signature";
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Signe un webhook sortant de Pont : `Pont-Signature: t=<unix>,v1=<hmac_sha256(t + "." + body)>`.
 */
export function signPontWebhook(secret: string, rawBody: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}

/**
 * Vérifie un webhook Pont. Rejette les signatures absentes, invalides ou hors tolérance (anti-rejeu).
 * Accepte plusieurs `v1=` pour permettre la rotation de secret.
 */
export function verifyPontWebhook(
  secret: string,
  rawBody: string,
  header: string | null,
  options: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  return verifyTimestampedHmac({
    secret,
    rawBody,
    header,
    scheme: "v1",
    toleranceSeconds: options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS,
    now: options.now ?? Math.floor(Date.now() / 1000),
  });
}

/** Format `t=<unix>,<scheme>=<hex>` partagé par Pont (`v1`) et FedaPay (`s`). */
export function verifyTimestampedHmac(params: {
  secret: string;
  rawBody: string;
  header: string | null;
  scheme: string;
  toleranceSeconds: number;
  now: number;
}): boolean {
  if (!params.header) return false;
  let timestamp = -1;
  const signatures: string[] = [];
  for (const part of params.header.split(",")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === params.scheme) signatures.push(value);
  }
  if (timestamp < 0 || signatures.length === 0) return false;
  if (Math.abs(params.now - timestamp) > params.toleranceSeconds) return false;
  const expected = hmacSha256Hex(params.secret, `${timestamp}.${params.rawBody}`);
  return signatures.some((signature) => safeEqual(signature, expected));
}
