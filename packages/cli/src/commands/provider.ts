import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { renderProvider } from "../provider/render.js";
import { parseProviderSpec, type ProviderSpec } from "../provider/spec.js";

export interface ProviderNewOptions {
  cwd: string;
  /** Fichier JSON de description : mode non interactif. */
  from?: string;
  /** Dossier de sortie (défaut : `./pont-adapter-<id>`). */
  out?: string;
  force: boolean;
  dryRun: boolean;
  log: (line: string) => void;
  /** Réponses aux questions (tests) ; sinon lecture du terminal. */
  ask?: (question: string, fallback?: string) => Promise<string>;
}

export interface ProviderNewResult {
  ok: boolean;
  dir?: string;
  files: string[];
  errors: string[];
}

type Ask = (question: string, fallback?: string) => Promise<string>;

const list = (value: string): string[] => value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
const yes = (value: string): boolean => /^(o|oui|y|yes)$/i.test(value.trim());

/** Interroge l'utilisateur et assemble la description (validée ensuite par le même schéma que `--from`). */
async function interview(ask: Ask, log: (line: string) => void): Promise<unknown> {
  log("Décrivez l'agrégateur (le plus souvent dans sa documentation d'API). Entrée = valeur par défaut.\n");
  const id = await ask("Identifiant court (minuscules, ex. monagregateur)");
  const label = await ask("Nom affiché", id);
  const countries = list(await ask("Pays couverts (codes ISO, ex. BJ,TG,CI)", "BJ")).map((c) => c.toUpperCase());
  const currencies = list(await ask("Devises (XOF, XAF)", "XOF")).map((c) => c.toUpperCase());
  const operators = list(await ask("Opérateurs Pont couverts (ex. mtn_bj,moov_bj ; vide = tous)", ""));
  const test = await ask("URL de base TEST (ex. https://sandbox.agregateur.com/v1)");
  const live = await ask("URL de base LIVE", test.replace("sandbox", "api"));
  const keys = list(await ask("Noms des clés demandées à l'utilisateur, camelCase (ex. secretKey)", "secretKey"));
  const authType = (await ask("Authentification : bearer, basic ou header", "bearer")).toLowerCase();
  let auth: unknown;
  if (authType === "basic") auth = { type: "basic", userKey: await ask("Clé utilisée comme identifiant", keys[0]), ...(keys[1] ? { passKey: await ask("Clé utilisée comme mot de passe", keys[1]) } : {}) };
  else if (authType === "header") auth = { type: "header", header: await ask("Nom de l'en-tête (ex. X-Api-Key)", "X-Api-Key"), key: await ask("Clé à y mettre", keys[0]) };
  else auth = { type: "bearer", key: await ask("Clé envoyée en Bearer", keys[0]) };

  const bodyVars = "{amount} {currency} {reference} {attemptId} {callbackUrl} {phone} {country} {description} {customerName} {customerEmail} {operator}";
  const endpoint = async (title: string, defaults: { method: string; path: string }, withBody: boolean, vars = bodyVars) => {
    const method = (await ask(`${title} : méthode HTTP`, defaults.method)).toUpperCase();
    const path = await ask(`${title} : chemin (ex. ${defaults.path})`, defaults.path);
    let body: unknown;
    if (withBody) {
      const raw = await ask(`${title} : corps JSON avec variables (${vars}) ; vide = aucun`, "");
      if (raw.trim()) body = JSON.parse(raw);
    }
    return { method, path, ...(body === undefined ? {} : { body }) };
  };
  const dep = await endpoint("Création de paiement", { method: "POST", path: "/payments" }, true);
  const depRef = await ask("Création de paiement : chemin de l'identifiant dans la réponse (ex. data.id)", "id");
  const depUrl = await ask("Création de paiement : chemin de l'URL de redirection (vide = push mobile money)", "");
  const ver = await endpoint("Vérification de paiement", { method: "GET", path: "/payments/{providerRef}" }, false);
  const verStatus = await ask("Vérification : chemin du statut dans la réponse", "status");
  const verAmount = await ask("Vérification : chemin du montant (vide = non fourni)", "amount");
  const verCurrency = await ask("Vérification : chemin de la devise (vide = non fourni)", "currency");
  const verFailure = await ask("Vérification : chemin du code d'échec (vide = aucun)", "");
  const verAttempt = await ask("Vérification : chemin où l'agrégateur renvoie votre référence/attemptId (vide = aucun)", "");

  log("\nCorrespondance des statuts : « statut_agrégateur=statut_pont », séparés par des virgules.");
  log("Statuts Pont : pending, processing, succeeded, failed, expired, cancelled. Un statut non listé reste pending.");
  const statusMap = Object.fromEntries(list(await ask("Statuts de paiement (ex. PAID=succeeded,FAILED=failed,WAITING=pending)", "PENDING=pending,SUCCESS=succeeded,FAILED=failed")).map((pair) => pair.split("=") as [string, string]));

  let payout: unknown;
  let verifyPayout: unknown;
  let refund: unknown;
  let verifyRefund: unknown;
  let transferStatusMap: unknown;
  const optionalVerify = async (title: string) => {
    const call = await endpoint(`${title} (vérification)`, { method: "GET", path: "/transfers/{providerRef}" }, false);
    const status = await ask(`${title} (vérification) : chemin du statut`, "status");
    const failureCode = await ask(`${title} (vérification) : chemin du code d'échec (vide = aucun)`, "");
    return { ...call, response: { status, ...(failureCode ? { failureCode } : {}) } };
  };
  if (yes(await ask("Gérer les retraits ? (o/N)", "n"))) {
    payout = { ...(await endpoint("Retrait", { method: "POST", path: "/payouts" }, true, "{amount} {currency} {reference} {attemptId} {phone} {country} {operator} {recipientName}")), response: { providerRef: await ask("Retrait : chemin de l'identifiant dans la réponse", "id") } };
    verifyPayout = await optionalVerify("Retrait");
  }
  if (yes(await ask("Gérer les remboursements ? (o/N)", "n"))) {
    refund = { ...(await endpoint("Remboursement", { method: "POST", path: "/refunds" }, true, "{amount} {currency} {attemptId} {paymentRef} {paymentAttemptId}")), response: { providerRef: await ask("Remboursement : chemin de l'identifiant dans la réponse", "id") } };
    verifyRefund = await optionalVerify("Remboursement");
  }
  if (payout || refund) {
    log("\nStatuts des retraits et remboursements. Statuts Pont : pending, processing, succeeded, failed, cancelled.");
    transferStatusMap = Object.fromEntries(list(await ask("Statuts (ex. SENT=succeeded,ERROR=failed)", "PENDING=pending,SENT=succeeded,FAILED=failed")).map((pair) => pair.split("=") as [string, string]));
  }

  log("\nWebhooks entrants (l'agrégateur vous appelle).");
  const header = await ask("En-tête qui porte la signature", "X-Signature");
  const algorithm = (await ask("Algorithme HMAC : sha256 ou sha512", "sha256")).toLowerCase();
  const encoding = (await ask("Encodage de la signature : hex ou base64", "hex")).toLowerCase();
  const prefix = await ask("Texte avant la signature (ex. sha256= ; vide = aucun)", "");
  const payload = (await ask("Charge signée : body ou timestamp.body", "body")).toLowerCase();
  const timestampHeader = payload === "timestamp.body" ? await ask("En-tête de l'horodatage (secondes Unix)", "X-Timestamp") : "";
  const lookupPath = await ask("Chemin de l'identifiant de l'opération dans le corps du webhook", "data.id");
  const lookupBy = await ask("Cet identifiant correspond à : providerRef ou attemptId", "providerRef");

  return {
    id,
    label,
    countries,
    currencies,
    ...(operators.length ? { operators } : {}),
    baseUrl: { test, live },
    keys,
    auth,
    deposit: { ...dep, response: { providerRef: depRef, ...(depUrl ? { redirectUrl: depUrl } : {}) } },
    verify: {
      ...ver,
      response: {
        status: verStatus,
        ...(verAmount ? { amount: verAmount } : {}),
        ...(verCurrency ? { currency: verCurrency } : {}),
        ...(verFailure ? { failureCode: verFailure } : {}),
        ...(verAttempt ? { attemptRef: verAttempt } : {}),
      },
    },
    ...(payout ? { payout, verifyPayout } : {}),
    ...(refund ? { refund, verifyRefund } : {}),
    statusMap,
    ...(transferStatusMap ? { transferStatusMap } : {}),
    webhook: {
      header,
      algorithm,
      encoding,
      ...(prefix ? { prefix } : {}),
      payload,
      ...(timestampHeader ? { timestampHeader } : {}),
      lookup: { path: lookupPath, by: lookupBy },
    },
  };
}

function terminalAsk(): { ask: Ask; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: async (question, fallback) => {
      const answer = (await rl.question(`${question}${fallback === undefined ? "" : ` [${fallback}]`} : `)).trim();
      return answer === "" ? fallback ?? "" : answer;
    },
    close: () => rl.close(),
  };
}

/** `pont provider new` : décrit un agrégateur (questions ou `--from spec.json`) et génère un adaptateur autonome. */
export async function runProviderNew(options: ProviderNewOptions): Promise<ProviderNewResult> {
  const { log } = options;
  let raw: unknown;
  if (options.from) {
    const file = resolve(options.cwd, options.from);
    if (!existsSync(file)) return { ok: false, files: [], errors: [`Fichier introuvable : ${options.from}`] };
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return { ok: false, files: [], errors: [`${options.from} n'est pas du JSON valide.`] };
    }
  } else {
    const terminal = options.ask ? null : terminalAsk();
    try {
      raw = await interview(options.ask ?? terminal!.ask, log);
    } catch (error) {
      return { ok: false, files: [], errors: [error instanceof SyntaxError ? "Corps JSON invalide." : error instanceof Error ? error.message : String(error)] };
    } finally {
      terminal?.close();
    }
  }

  const parsed = parseProviderSpec(raw);
  if (!parsed.ok) return { ok: false, files: [], errors: parsed.errors };
  const spec: ProviderSpec = parsed.spec;
  const dir = resolve(options.cwd, options.out ?? `pont-adapter-${spec.id.replace(/_/g, "-")}`);
  const files = renderProvider(spec);
  if (!options.dryRun && existsSync(dir) && !options.force) {
    return { ok: false, dir, files: [], errors: [`${dir} existe déjà : ajoutez --force pour le remplacer, ou choisissez --out.`] };
  }
  if (!options.dryRun) {
    for (const file of files) {
      const target = join(dir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
  }
  log(`${options.dryRun ? "À créer" : "Adaptateur généré"} dans ${dir} :`);
  for (const file of files) log(`  ${file.path}`);
  if (!options.dryRun) {
    log("\nÉtapes suivantes :");
    log(`  cd ${dir} && pnpm install && pnpm test`);
    log("  Les tests utilisent un faux serveur : essayez ensuite avec le sandbox de l'agrégateur.");
  }
  return { ok: true, dir, files: files.map((file) => file.path), errors: [] };
}
