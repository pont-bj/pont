import { z } from "zod";

/** Variables que le gabarit de chaque appel peut utiliser (`{amount}`, `{phone}`…). */
export const PLACEHOLDERS = {
  deposit: ["amount", "currency", "reference", "attemptId", "callbackUrl", "returnUrl", "phone", "country", "description", "customerName", "customerEmail", "operator"],
  payout: ["amount", "currency", "reference", "attemptId", "callbackUrl", "phone", "country", "description", "recipientName", "recipientEmail", "operator"],
  refund: ["amount", "currency", "attemptId", "paymentRef", "paymentAttemptId"],
  verify: ["providerRef", "attemptId"],
} as const;

type Json = string | number | boolean | { [key: string]: Json } | Json[];

const template: z.ZodType<Json> = z.lazy(() => z.union([z.string().max(500), z.number(), z.boolean(), z.array(template).max(50), z.record(template)]));

const dotPath = z.string().regex(/^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/, "Chemin du type data.id attendu.");
const httpPath = z.string().regex(/^\/[^\s]*$/, "Le chemin commence par / et ne contient pas d'espace.");
const method = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const keyName = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]{1,30}$/, "Nom en camelCase (ex. secretKey).")
  .refine((name) => !["mode", "webhookSecret", "fetch", "now"].includes(name), "Nom réservé (mode, webhookSecret, fetch, now).");

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(value), "https:// obligatoire (http seulement pour localhost).")
  .transform((value) => value.replace(/\/$/, ""));

const responseMap = z.object({
  /** Où trouver l'identifiant de l'opération chez l'agrégateur. */
  providerRef: dotPath.optional(),
  /** Si présent et renseigné, le client est redirigé vers cette page. */
  redirectUrl: dotPath.optional(),
});

const verifyResponse = z.object({
  status: dotPath,
  amount: dotPath.optional(),
  currency: dotPath.optional(),
  failureCode: dotPath.optional(),
  /** Où l'agrégateur renvoie notre identifiant de tentative (lien anti-substitution). */
  attemptRef: dotPath.optional(),
});

const endpoint = (kind: keyof typeof PLACEHOLDERS) =>
  z.object({ method, path: httpPath, body: template.optional(), response: kind === "verify" ? verifyResponse : responseMap });

const verifyEndpoint = z.object({ method, path: httpPath, response: verifyResponse });

const paymentStatuses = z.enum(["pending", "processing", "succeeded", "failed", "expired", "cancelled"]);
const transferStatuses = z.enum(["pending", "processing", "succeeded", "failed", "cancelled"]);

export const providerSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{2,19}$/, "3 à 20 caractères : minuscules, chiffres, _ ; commence par une lettre."),
    label: z.string().min(2).max(60),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    currencies: z.array(z.enum(["XOF", "XAF"])).min(1),
    /** Opérateurs Pont couverts (`mtn_bj`…). Absent : tous. */
    operators: z.array(z.string().regex(/^[a-z]+_[a-z]{2}$/)).optional(),
    /** Code de l'agrégateur pour chaque opérateur Pont, utilisé par `{operator}`. */
    operatorCodes: z.record(z.string().max(60)).optional(),
    baseUrl: z.object({ test: httpsUrl, live: httpsUrl }),
    keys: z.array(keyName).min(1).max(8),
    auth: z.discriminatedUnion("type", [
      z.object({ type: z.literal("bearer"), key: keyName }),
      z.object({ type: z.literal("basic"), userKey: keyName, passKey: keyName.optional() }),
      z.object({ type: z.literal("header"), header: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,40}$/), key: keyName }),
    ]),
    deposit: endpoint("deposit").extend({ response: responseMap.extend({ providerRef: dotPath }) }),
    verify: verifyEndpoint,
    payout: endpoint("payout").extend({ response: responseMap.extend({ providerRef: dotPath }) }).optional(),
    verifyPayout: verifyEndpoint.optional(),
    refund: endpoint("refund").extend({ response: responseMap.extend({ providerRef: dotPath }) }).optional(),
    verifyRefund: verifyEndpoint.optional(),
    /** Statut de l'agrégateur → statut Pont. Un statut absent de la table reste `pending` : jamais de succès par défaut. */
    statusMap: z.record(paymentStatuses).refine((map) => Object.keys(map).length > 0, "Au moins un statut."),
    transferStatusMap: z.record(transferStatuses).optional(),
    webhook: z
      .object({
        header: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,40}$/),
        algorithm: z.enum(["sha256", "sha512"]),
        encoding: z.enum(["hex", "base64"]),
        /** Texte placé devant la signature (`sha256=`). */
        prefix: z.string().max(20).optional(),
        /** Charge signée : le corps brut seul, ou `<horodatage>.<corps>`. */
        payload: z.enum(["body", "timestamp.body"]),
        timestampHeader: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,40}$/).optional(),
        toleranceSeconds: z.number().int().min(30).max(3600).optional(),
        lookup: z.object({ path: dotPath, by: z.enum(["providerRef", "attemptId"]), kind: z.enum(["payment", "payout", "refund"]).optional() }),
      })
      .refine((w) => w.payload === "body" || Boolean(w.timestampHeader), { message: "timestampHeader requis avec payload=timestamp.body", path: ["timestampHeader"] }),
  })
  .superRefine((spec, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    for (const name of spec.keys) if (spec.keys.filter((k) => k === name).length > 1) issue(["keys"], `Clé en double : ${name}.`);
    const known = new Set(spec.keys);
    const need = (name: string, path: (string | number)[]) => known.has(name) || issue(path, `« ${name} » n'est pas dans keys.`);
    if (spec.auth.type === "bearer") need(spec.auth.key, ["auth", "key"]);
    if (spec.auth.type === "header") need(spec.auth.key, ["auth", "key"]);
    if (spec.auth.type === "basic") {
      need(spec.auth.userKey, ["auth", "userKey"]);
      if (spec.auth.passKey) need(spec.auth.passKey, ["auth", "passKey"]);
    }
    if (spec.payout && !spec.verifyPayout) issue(["verifyPayout"], "Un retrait exige son endpoint de vérification.");
    if (spec.refund && !spec.verifyRefund) issue(["verifyRefund"], "Un remboursement exige son endpoint de vérification.");
    if ((spec.payout || spec.refund) && !spec.transferStatusMap) issue(["transferStatusMap"], "Table de statuts des retraits et remboursements requise.");
    // Brouillon issu de `pont provider import` : refuser tant qu'une valeur est marquée « à compléter ».
    const unfinished = (value: unknown, path: (string | number)[]): void => {
      if (typeof value === "string") {
        if (value.includes("A_COMPLETER")) issue(path, "À compléter : renseignez cette valeur d'après la documentation de l'agrégateur.");
      } else if (Array.isArray(value)) value.forEach((item, i) => unfinished(item, [...path, i]));
      else if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) unfinished(v, [...path, k]);
    };
    unfinished(spec, []);
    const check = (value: unknown, kind: keyof typeof PLACEHOLDERS, path: (string | number)[]): void => {
      const allowed: readonly string[] = PLACEHOLDERS[kind];
      if (typeof value === "string") {
        for (const match of value.matchAll(/\{(\w+)\}/g)) if (!allowed.includes(match[1]!)) issue(path, `Variable {${match[1]}} inconnue ici (autorisées : ${allowed.join(", ")}).`);
      } else if (Array.isArray(value)) value.forEach((item, i) => check(item, kind, [...path, i]));
      else if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) check(v, kind, [...path, k]);
    };
    const wired: Array<[string, { path: string; body?: Json | undefined } | undefined, keyof typeof PLACEHOLDERS]> = [
      ["deposit", spec.deposit, "deposit"],
      ["verify", spec.verify, "verify"],
      ["payout", spec.payout, "payout"],
      ["verifyPayout", spec.verifyPayout, "verify"],
      ["refund", spec.refund, "refund"],
      ["verifyRefund", spec.verifyRefund, "verify"],
    ];
    for (const [name, ep, kind] of wired) {
      if (!ep) continue;
      check(ep.path, kind, [name, "path"]);
      check(ep.body, kind, [name, "body"]);
    }
  });

export type ProviderSpec = z.infer<typeof providerSpecSchema>;

export function parseProviderSpec(raw: unknown): { ok: true; spec: ProviderSpec } | { ok: false; errors: string[] } {
  const result = providerSpecSchema.safeParse(raw);
  if (result.success) return { ok: true, spec: result.data };
  return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`) };
}
