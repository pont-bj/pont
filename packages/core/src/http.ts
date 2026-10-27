export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpResult =
  | { kind: "response"; status: number; body: unknown; text: string }
  /** La connexion n'a pas pu s'établir : la requête n'a jamais atteint l'agrégateur. */
  | { kind: "not_sent"; reason: string }
  /** La requête a pu atteindre l'agrégateur mais aucune réponse exploitable n'est revenue. */
  | { kind: "unknown"; reason: string };

// Erreurs survenant avant l'envoi de la requête. ECONNRESET et les timeouts restent ambigus.
const NOT_SENT_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "CERT_HAS_EXPIRED", "UND_ERR_CONNECT_TIMEOUT"]);

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const cause = "cause" in error ? (error as { cause: unknown }).cause : undefined;
  for (const candidate of [cause, error]) {
    if (typeof candidate === "object" && candidate !== null && "code" in candidate) {
      const code = (candidate as { code: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return null;
}

/**
 * Appel HTTP vers un agrégateur, classé pour la décision de failover :
 * seuls les échecs de connexion certains sont `not_sent` ; tout le reste est `unknown` (R-005, R-006).
 */
export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { kind: "response", status: response.status, body, text };
  } catch (error) {
    const code = errorCode(error);
    if (code && NOT_SENT_CODES.has(code)) return { kind: "not_sent", reason: code };
    return { kind: "unknown", reason: code ?? (error instanceof Error ? error.name : "network_error") };
  } finally {
    clearTimeout(timer);
  }
}

/** Lecture sûre d'un champ dans une valeur JSON non typée. */
export function field(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function stringField(value: unknown, ...path: string[]): string | null {
  const found = field(value, ...path);
  if (typeof found === "string") return found;
  if (typeof found === "number") return String(found);
  return null;
}

export function numberField(value: unknown, ...path: string[]): number | null {
  const found = field(value, ...path);
  if (typeof found === "number" && Number.isFinite(found)) return found;
  if (typeof found === "string" && found.trim() !== "" && Number.isFinite(Number(found))) return Number(found);
  return null;
}
