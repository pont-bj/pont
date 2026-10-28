import { createHash, createPublicKey, verify as cryptoVerify, constants } from "node:crypto";
import { safeEqual } from "./signature.js";

// Vérification des signatures HTTP RFC 9421, telle que décrite par PawaPay (documentation officielle de l’agrégateur, « Signatures in API »).

export type HttpSignatureAlgorithm = "ecdsa-p256-sha256" | "ecdsa-p384-sha384" | "rsa-pss-sha512" | "rsa-v1_5-sha256";

export interface HttpSignatureRequest {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

export type HttpSignatureResult =
  | { valid: true; keyId: string; label: string }
  | { valid: false; reason: string };

export interface ParsedSignatureInput {
  label: string;
  components: string[];
  /** Texte exact après `label=`, réutilisé tel quel pour `@signature-params`. */
  serialized: string;
  params: Record<string, string | number>;
}

/** `sig-pp=("@method" "@path" "content-digest");alg="ecdsa-p256-sha256";keyid="K";created=1;expires=2` */
export function parseSignatureInput(header: string): ParsedSignatureInput | null {
  const match = /^\s*([A-Za-z0-9_.*-]+)=(\(([^)]*)\)(.*))$/.exec(header);
  if (!match?.[1] || !match[2] || match[3] === undefined) return null;
  const components = [...match[3].matchAll(/"([^"]+)"/g)].map((m) => m[1]!.toLowerCase());
  const params: Record<string, string | number> = {};
  for (const part of (match[4] ?? "").split(";")) {
    const kv = /^\s*([a-z]+)=(?:"([^"]*)"|(\d+))\s*$/.exec(part);
    if (kv?.[1]) params[kv[1]] = kv[2] ?? Number(kv[3]);
  }
  return { label: match[1], components, serialized: match[2], params };
}

/** `sig-pp=:BASE64:` */
export function parseSignature(header: string, label: string): Buffer | null {
  for (const entry of header.split(",")) {
    const match = /^\s*([A-Za-z0-9_.*-]+)=:([A-Za-z0-9+/=]+):\s*$/.exec(entry);
    if (match?.[1] === label && match[2]) return Buffer.from(match[2], "base64");
  }
  return null;
}

function componentValue(name: string, request: HttpSignatureRequest): string | null {
  const url = new URL(request.url);
  switch (name) {
    case "@method":
      return request.method.toUpperCase();
    case "@authority":
      return url.host.toLowerCase();
    case "@path":
      return url.pathname;
    case "@query":
      return url.search || "?";
    case "@target-uri":
      return url.toString();
    default:
      if (name.startsWith("@")) return null;
      return request.headers.get(name)?.trim() ?? null;
  }
}

export function buildSignatureBase(input: ParsedSignatureInput, request: HttpSignatureRequest): string | null {
  const lines: string[] = [];
  for (const component of input.components) {
    const value = componentValue(component, request);
    if (value === null) return null;
    lines.push(`"${component}": ${value}`);
  }
  lines.push(`"@signature-params": ${input.serialized}`);
  return lines.join("\n");
}

export function verifyContentDigest(header: string | null, body: string): boolean {
  if (!header) return false;
  const match = /(sha-512|sha-256)=:([^:]+):/.exec(header);
  if (!match?.[1] || !match[2]) return false;
  const expected = createHash(match[1] === "sha-512" ? "sha512" : "sha256").update(body, "utf8").digest("base64");
  return safeEqual(match[2], expected);
}

/**
 * Vérifie une requête signée : intégrité du corps (`Content-Digest`), composants couverts obligatoires,
 * fenêtre `created`/`expires`, clé connue, puis signature cryptographique.
 */
export function verifyHttpSignature(
  request: HttpSignatureRequest,
  options: {
    publicKeys: Record<string, string>;
    requiredComponents: string[];
    nowSeconds: number;
    maxAgeSeconds?: number;
  },
): HttpSignatureResult {
  const inputHeader = request.headers.get("signature-input");
  const signatureHeader = request.headers.get("signature");
  if (!inputHeader || !signatureHeader) return { valid: false, reason: "signature absente" };
  const input = parseSignatureInput(inputHeader);
  if (!input) return { valid: false, reason: "Signature-Input illisible" };

  for (const required of options.requiredComponents) {
    if (!input.components.includes(required)) return { valid: false, reason: `composant non signé : ${required}` };
  }
  if (input.components.includes("content-digest") && !verifyContentDigest(request.headers.get("content-digest"), request.body)) {
    return { valid: false, reason: "Content-Digest invalide" };
  }

  const created = typeof input.params.created === "number" ? input.params.created : null;
  const expires = typeof input.params.expires === "number" ? input.params.expires : null;
  if (created === null) return { valid: false, reason: "created absent" };
  if (created > options.nowSeconds + 60) return { valid: false, reason: "signature datée du futur" };
  if (expires !== null && options.nowSeconds > expires) return { valid: false, reason: "signature expirée" };
  if (options.nowSeconds - created > (options.maxAgeSeconds ?? 300)) return { valid: false, reason: "signature trop ancienne" };

  const keyId = typeof input.params.keyid === "string" ? input.params.keyid : "";
  const pem = options.publicKeys[keyId];
  if (!pem) return { valid: false, reason: `clé inconnue : ${keyId}` };
  const algorithm = input.params.alg;
  const signature = parseSignature(signatureHeader, input.label);
  if (!signature) return { valid: false, reason: "Signature illisible" };
  const base = buildSignatureBase(input, request);
  if (base === null) return { valid: false, reason: "composant manquant dans la requête" };

  const key = createPublicKey(pem);
  const data = Buffer.from(base, "utf8");
  let ok = false;
  switch (algorithm) {
    // L'exemple PawaPay (`MEQCI…`) est une signature ECDSA encodée en DER.
    case "ecdsa-p256-sha256":
      ok = cryptoVerify("sha256", data, { key, dsaEncoding: "der" }, signature);
      break;
    case "ecdsa-p384-sha384":
      ok = cryptoVerify("sha384", data, { key, dsaEncoding: "der" }, signature);
      break;
    case "rsa-pss-sha512":
      ok = cryptoVerify("sha512", data, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 }, signature);
      break;
    case "rsa-v1_5-sha256":
      ok = cryptoVerify("sha256", data, { key, padding: constants.RSA_PKCS1_PADDING }, signature);
      break;
    default:
      return { valid: false, reason: `algorithme non supporté : ${String(algorithm)}` };
  }
  return ok ? { valid: true, keyId, label: input.label } : { valid: false, reason: "signature invalide" };
}
