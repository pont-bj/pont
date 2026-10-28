import { parse as parseYaml } from "yaml";

/** Marqueur laissé dans le brouillon : `pont provider new --from` refuse tant qu'il en reste un. */
export const A_COMPLETER = "A_COMPLETER";

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

export interface ImportReport {
  /** Ce qui a été lu dans la spécification. */
  detected: string[];
  /** Ce qui a été deviné : à relire. */
  review: string[];
  /** Ce que la spécification ne dit pas : à renseigner à la main. */
  missing: string[];
}

export interface ImportResult {
  draft: Rec;
  report: ImportReport;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Lit une spécification depuis une URL https ou un fichier (JSON ou YAML). */
export async function parseSpecText(text: string): Promise<unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  return parseYaml(trimmed);
}

export async function fetchSpecText(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  if (!url.startsWith("https://")) throw new Error("L'adresse de la spécification doit commencer par https://.");
  const response = await fetchFn(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
  if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status}).`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("Spécification trop volumineuse (5 Mo maximum).");
  return text;
}

/** Résout les `$ref` locaux (`#/components/...`), avec garde contre les boucles. */
function deref(root: Rec, node: unknown, depth = 0): unknown {
  if (depth > 12 || !isRec(node)) return node;
  const ref = str(node["$ref"]);
  if (ref?.startsWith("#/")) {
    let target: unknown = root;
    for (const part of ref.slice(2).split("/")) target = isRec(target) ? target[part.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
    return deref(root, target, depth + 1);
  }
  return node;
}

/** Propriétés d'un schéma (avec allOf), à plat : chemin pointé → schéma de la propriété. */
function flatten(root: Rec, schema: unknown, prefix = "", depth = 0, out: Map<string, Rec> = new Map(), required: Set<string> = new Set()): { fields: Map<string, Rec>; required: Set<string> } {
  const node = deref(root, schema);
  if (!isRec(node) || depth > 4) return { fields: out, required };
  for (const part of Array.isArray(node["allOf"]) ? node["allOf"] : []) flatten(root, part, prefix, depth, out, required);
  const properties = isRec(node["properties"]) ? node["properties"] : {};
  const needed = Array.isArray(node["required"]) ? node["required"].filter((n): n is string => typeof n === "string") : [];
  for (const [name, raw] of Object.entries(properties)) {
    const prop = deref(root, raw);
    if (!isRec(prop)) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    if (needed.includes(name)) required.add(path);
    if (isRec(prop["properties"]) || Array.isArray(prop["allOf"])) flatten(root, prop, path, depth + 1, out, required);
    else out.set(path, prop);
  }
  return { fields: out, required };
}

const norm = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const leaf = (path: string): string => path.split(".").pop() ?? path;

/** Champ de la requête → variable Pont. L'ordre compte : le premier motif qui correspond gagne. */
const PLACEHOLDER_RULES: Array<[RegExp, string]> = [
  [/(callback|webhook|notif|ipn)/, "callbackUrl"],
  [/(return|redirect|success|cancel|back)url|^(return|redirect|success|cancel)/, "returnUrl"],
  [/(msisdn|phone|mobile|payerphone|walletnumber|accountnumber)/, "phone"],
  [/(operator|correspondent|provider|network|paymentmethod|channel)/, "operator"],
  [/(email|mail)/, "customerEmail"],
  [/(customername|fullname|firstname|payername|clientname|^name$)/, "customerName"],
  [/(description|narration|reason|label|statementdescriptor|memo)/, "description"],
  [/^(currency|ccy|devise)/, "currency"],
  [/^(country|countrycode)/, "country"],
  [/(amount|montant|value|total|price)/, "amount"],
  [/(reference|externalid|orderid|clientreference|merchantreference|transactionid|depositid|idempotency|requestid|payoutid|refundid|invoiceid)/, "attemptId"],
];

function placeholderFor(path: string): string | undefined {
  const full = norm(path);
  const name = norm(leaf(path));
  for (const [pattern, variable] of PLACEHOLDER_RULES) if (pattern.test(name) || (name === "value" && pattern.test(full))) return variable;
  return undefined;
}

/** Rebâtit un objet imbriqué depuis des chemins pointés. */
function nest(entries: Array<[string, string]>): Rec {
  const root: Rec = {};
  for (const [path, value] of entries) {
    const parts = path.split(".");
    let cursor = root;
    for (const part of parts.slice(0, -1)) {
      const next = cursor[part];
      cursor = isRec(next) ? next : (cursor[part] = {});
    }
    cursor[parts[parts.length - 1]!] = value;
  }
  return root;
}

interface Operation {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  op: Rec;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function operations(doc: Rec): Operation[] {
  const found: Operation[] = [];
  const paths = isRec(doc["paths"]) ? doc["paths"] : {};
  for (const [path, item] of Object.entries(paths)) {
    const resolved = deref(doc, item);
    if (!isRec(resolved)) continue;
    for (const method of METHODS) {
      const op = deref(doc, resolved[method]);
      if (isRec(op)) found.push({ method: method.toUpperCase() as Operation["method"], path, op: { ...op, __pathParams: resolved["parameters"] } });
    }
  }
  return found;
}

const text = (o: Operation): string => `${o.path} ${str(o.op["operationId"]) ?? ""} ${str(o.op["summary"]) ?? ""}`.toLowerCase();
const hasParam = (o: Operation): boolean => /\{[^}]+\}/.test(o.path);
const isPayoutText = (t: string): boolean => /(payout|disburs|withdraw|transfer|cashout|remit)/.test(t);
const isRefundText = (t: string): boolean => /refund|reimburs|rembours/.test(t);
const isPaymentText = (t: string): boolean => /(payment|deposit|charge|collect|checkout|transaction|invoice|purchase|pay\b|cashin|momo)/.test(t);

function pick(candidates: Operation[], score: (o: Operation) => number): { best?: Operation; others: Operation[] } {
  const ranked = candidates.map((o) => ({ o, s: score(o) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.o.path.length - b.o.path.length);
  return { ...(ranked[0] ? { best: ranked[0].o } : {}), others: ranked.slice(1, 4).map((x) => x.o) };
}

const label = (o: Operation): string => `${o.method} ${o.path}`;

function successSchema(doc: Rec, o: Operation): unknown {
  const responses = isRec(o.op["responses"]) ? o.op["responses"] : {};
  for (const code of ["200", "201", "202", "2XX", "default"]) {
    const response = deref(doc, responses[code]);
    if (!isRec(response)) continue;
    const content = isRec(response["content"]) ? response["content"] : {};
    const json = deref(doc, content["application/json"] ?? Object.values(content)[0]);
    if (isRec(json) && json["schema"] !== undefined) return json["schema"];
  }
  return undefined;
}

function requestSchema(doc: Rec, o: Operation): unknown {
  const body = deref(doc, o.op["requestBody"]);
  if (!isRec(body)) return undefined;
  const content = isRec(body["content"]) ? body["content"] : {};
  const json = deref(doc, content["application/json"] ?? Object.values(content)[0]);
  return isRec(json) ? json["schema"] : undefined;
}

/** Premier chemin dont le dernier segment correspond au motif (les plus courts d'abord). */
function findPath(fields: Map<string, Rec>, pattern: RegExp): string | undefined {
  return [...fields.keys()].filter((p) => pattern.test(norm(leaf(p)))).sort((a, b) => a.split(".").length - b.split(".").length)[0];
}

/** Statut de l'agrégateur → statut Pont : seuls les noms sans ambiguïté sont repris. */
const CLEAR_STATUS: Array<[RegExp, string]> = [
  [/^(success|succeeded|successful|paid|completed|complete|settled)$/i, "succeeded"],
  [/^(failed|failure|rejected|declined|error|refused)$/i, "failed"],
  [/^(cancel+ed|cancel|canceled)$/i, "cancelled"],
  [/^(expired|timeout|timedout)$/i, "expired"],
  [/^(pending|created|initiated|waiting|new)$/i, "pending"],
  [/^(processing|submitted|inprogress|in_progress)$/i, "processing"],
];

function mapStatuses(values: string[], review: string[], where: string): Rec {
  const map: Rec = {};
  const unclear: string[] = [];
  for (const value of values) {
    const hit = CLEAR_STATUS.find(([pattern]) => pattern.test(value));
    if (hit) map[value] = hit[1];
    else unclear.push(value);
  }
  if (unclear.length) review.push(`${where} : statuts non classés (ils resteront « pending » tant que vous ne les classez pas) : ${unclear.join(", ")}.`);
  return map;
}

function enumValues(prop: Rec | undefined): string[] {
  const values = prop && Array.isArray(prop["enum"]) ? prop["enum"] : [];
  return values.filter((v): v is string => typeof v === "string");
}

function slug(title: string): string {
  const cleaned = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = /^[a-z]/.test(cleaned) ? cleaned : `p_${cleaned}`;
  return base.slice(0, 20).replace(/_+$/, "").padEnd(3, "x");
}

/** Convertit une spécification OpenAPI 3 en brouillon de description d'agrégateur, avec un compte rendu honnête. */
export function importOpenApi(input: unknown): ImportResult {
  if (!isRec(input)) throw new Error("La spécification n'est pas un objet JSON/YAML.");
  if (str(input["swagger"])?.startsWith("2")) throw new Error("Swagger 2.0 n'est pas pris en charge : convertissez-la en OpenAPI 3 (par exemple avec swagger-converter).");
  if (!str(input["openapi"])?.startsWith("3")) throw new Error("Spécification OpenAPI 3 attendue (champ « openapi: 3.x »).");

  const report: ImportReport = { detected: [], review: [], missing: [] };
  const draft: Rec = {};
  const info = isRec(input["info"]) ? input["info"] : {};
  const title = str(info["title"]) ?? "agregateur";
  draft["id"] = slug(title);
  draft["label"] = title.slice(0, 60);
  report.detected.push(`Nom : « ${title} » (identifiant ${draft["id"]}).`);

  // Adresses de base : seule une adresse nommée sandbox/test est reprise comme TEST.
  const servers = (Array.isArray(input["servers"]) ? input["servers"] : []).filter(isRec).map((s) => ({ url: str(s["url"]) ?? "", description: str(s["description"]) ?? "" }));
  const isTest = (s: { url: string; description: string }): boolean => /\b(sandbox|test|testing|staging|demo)\b/i.test(`${s.url} ${s.description}`);
  const live = servers.find((s) => !isTest(s) && s.url.startsWith("https://"));
  const test = servers.find((s) => isTest(s) && s.url.startsWith("https://"));
  draft["baseUrl"] = { test: test?.url ?? `https://${A_COMPLETER}.invalid`, live: live?.url ?? `https://${A_COMPLETER}.invalid` };
  if (test) report.detected.push(`Adresse TEST : ${test.url}`);
  else report.missing.push("Adresse de base TEST (sandbox) : aucune adresse de test dans « servers ».");
  if (live) report.detected.push(`Adresse LIVE : ${live.url}`);
  else report.missing.push("Adresse de base LIVE.");

  // Authentification.
  const components = isRec(input["components"]) ? input["components"] : {};
  const schemes = isRec(components["securitySchemes"]) ? Object.values(components["securitySchemes"]).map((s) => deref(input, s)).filter(isRec) : [];
  const scheme = schemes[0];
  if (scheme && str(scheme["type"]) === "http" && str(scheme["scheme"])?.toLowerCase() === "bearer") {
    draft["keys"] = ["secretKey"];
    draft["auth"] = { type: "bearer", key: "secretKey" };
    report.detected.push("Authentification : Bearer (clé « secretKey »).");
  } else if (scheme && str(scheme["type"]) === "http" && str(scheme["scheme"])?.toLowerCase() === "basic") {
    draft["keys"] = ["apiUser", "apiKey"];
    draft["auth"] = { type: "basic", userKey: "apiUser", passKey: "apiKey" };
    report.detected.push("Authentification : Basic (clés « apiUser » et « apiKey »).");
  } else if (scheme && str(scheme["type"]) === "apiKey" && str(scheme["in"]) === "header" && str(scheme["name"])) {
    draft["keys"] = ["apiKey"];
    draft["auth"] = { type: "header", header: str(scheme["name"]), key: "apiKey" };
    report.detected.push(`Authentification : en-tête ${str(scheme["name"])} (clé « apiKey »).`);
  } else {
    draft["keys"] = ["secretKey"];
    draft["auth"] = { type: "bearer", key: "secretKey" };
    report.review.push("Authentification : schéma absent ou non géré (OAuth2, requête signée…). Bearer par défaut : à vérifier dans la documentation.");
  }
  report.review.push("Les noms de clés (secretKey, apiKey…) sont des noms de départ : c'est ce que l'utilisateur de Pont saisira.");

  // Opérations.
  const all = operations(input);
  const deposit = pick(all.filter((o) => o.method === "POST" && !hasParam(o)), (o) => {
    const t = text(o);
    return isPayoutText(t) || isRefundText(t) ? 0 : (isPaymentText(t) ? 2 : 0) + (/(collect|deposit|charge|checkout)/.test(t) ? 2 : 0);
  });
  const verifyOf = (kind: "payment" | "payout" | "refund", create: Operation | undefined) =>
    pick(all.filter((o) => o.method === "GET" && hasParam(o)), (o) => {
      const t = text(o);
      const family = kind === "payout" ? isPayoutText(t) : kind === "refund" ? isRefundText(t) : isPaymentText(t) && !isPayoutText(t) && !isRefundText(t);
      if (!family) return 0;
      const sharesRoot = create && o.path.startsWith(create.path) ? 3 : 0;
      return 1 + sharesRoot + (/(status|verify|check|retrieve|get)/.test(t) ? 1 : 0);
    });
  const payout = pick(all.filter((o) => o.method === "POST" && !hasParam(o)), (o) => (isPayoutText(text(o)) && !isRefundText(text(o)) ? 3 : 0));
  const refund = pick(all.filter((o) => o.method === "POST"), (o) => (isRefundText(text(o)) ? 3 : 0));

  const vDeposit = verifyOf("payment", deposit.best);
  const reviewChoice = (name: string, picked: { best?: Operation; others: Operation[] }) => {
    if (picked.best && picked.others.length) report.review.push(`${name} : retenu ${label(picked.best)} ; autres candidats : ${picked.others.map(label).join(", ")}.`);
  };
  reviewChoice("Création de paiement", deposit);
  reviewChoice("Vérification de paiement", vDeposit);

  const unmappedRequired: string[] = [];
  const buildCreate = (name: string, o: Operation | undefined, withUrl: boolean) => {
    if (!o) return undefined;
    const { fields, required } = flatten(input, requestSchema(input, o));
    const entries: Array<[string, string]> = [];
    const ignored: string[] = [];
    for (const path of fields.keys()) {
      const variable = placeholderFor(path);
      if (variable) entries.push([path, `{${variable}}`]);
      else if (required.has(path)) {
        entries.push([path, `${A_COMPLETER}_${leaf(path)}`]);
        unmappedRequired.push(`${name} : champ obligatoire « ${path} » sans équivalent Pont (valeur à fournir).`);
      } else ignored.push(path);
    }
    if (ignored.length) report.review.push(`${name} : champs facultatifs non repris : ${ignored.join(", ")}.`);
    const mapped = entries.filter(([, v]) => v.startsWith("{")).map(([p, v]) => `${p} → ${v}`);
    if (mapped.length) report.review.push(`${name} : champs reconnus par leur nom, à confirmer : ${mapped.join(" ; ")}.`);
    const response = flatten(input, successSchema(input, o)).fields;
    const providerRef = findPath(response, /^(id|reference|transactionid|paymentid|depositid|payoutid|refundid|token)$/);
    const redirectUrl = withUrl ? findPath(response, /(redirect|paymenturl|checkouturl|link|url)/) : undefined;
    if (!providerRef) report.missing.push(`${name} : identifiant de l'opération dans la réponse (aucun champ « id » évident).`);
    return {
      method: o.method,
      path: o.path.replace(/\{[^}]+\}/g, "{providerRef}"),
      ...(entries.length ? { body: nest(entries) } : {}),
      response: { providerRef: providerRef ?? `${A_COMPLETER}`, ...(redirectUrl ? { redirectUrl } : {}) },
    };
  };
  const buildVerify = (name: string, o: Operation | undefined) => {
    if (!o) return { value: undefined, statuses: [] as string[] };
    const { fields } = flatten(input, successSchema(input, o));
    const status = findPath(fields, /^(status|state|paymentstatus|transactionstatus)$/);
    const amount = findPath(fields, /^(amount|montant|total|value)$/);
    const currency = findPath(fields, /^(currency|ccy|devise)$/);
    const failureCode = findPath(fields, /(failure|error|reasoncode|errorcode|rejection)/);
    const attemptRef = findPath(fields, /^(reference|externalid|clientreference|merchantreference|orderid)$/);
    if (!status) report.missing.push(`${name} : chemin du statut dans la réponse.`);
    if (!amount) report.review.push(`${name} : pas de montant dans la réponse : le montant ne sera pas recoupé.`);
    if (!attemptRef) report.review.push(`${name} : pas de champ qui renvoie votre référence : le lien anti-substitution est absent.`);
    const params = o.path.match(/\{([^}]+)\}/g) ?? [];
    if (params.length > 1) report.review.push(`${name} : plusieurs paramètres de chemin (${params.join(", ")}) ; seul {providerRef} est géré.`);
    return {
      value: {
        method: o.method,
        path: o.path.replace(/\{[^}]+\}/, "{providerRef}"),
        response: { status: status ?? A_COMPLETER, ...(amount ? { amount } : {}), ...(currency ? { currency } : {}), ...(failureCode ? { failureCode } : {}), ...(attemptRef ? { attemptRef } : {}) },
      },
      statuses: enumValues(status ? fields.get(status) : undefined),
    };
  };

  const createDeposit = buildCreate("Paiement", deposit.best, true);
  if (createDeposit) {
    draft["deposit"] = createDeposit;
    report.detected.push(`Création de paiement : ${label(deposit.best!)}.`);
  } else report.missing.push("Création de paiement : aucune opération POST de type paiement/collecte trouvée.");
  const verify = buildVerify("Vérification de paiement", vDeposit.best);
  if (verify.value) {
    draft["verify"] = verify.value;
    report.detected.push(`Vérification de paiement : ${label(vDeposit.best!)}.`);
  } else report.missing.push("Vérification de paiement : aucune opération GET avec identifiant trouvée.");

  const statuses = verify.statuses;
  if (statuses.length) {
    draft["statusMap"] = mapStatuses(statuses, report.review, "Statuts de paiement");
    report.detected.push(`Statuts de paiement listés par la spécification : ${statuses.join(", ")}.`);
  } else {
    draft["statusMap"] = {};
    report.missing.push("Statuts de paiement : la spécification ne liste pas les valeurs possibles ; indiquez la correspondance.");
  }

  const createPayout = buildCreate("Retrait", payout.best, false);
  const verifyPayout = buildVerify("Vérification de retrait", verifyOf("payout", payout.best).best);
  if (createPayout && verifyPayout.value) {
    draft["payout"] = createPayout;
    draft["verifyPayout"] = verifyPayout.value;
    report.detected.push(`Retrait : ${label(payout.best!)} (optionnel).`);
  } else if (createPayout) report.review.push("Retrait détecté sans opération de vérification : ignoré.");
  const createRefund = buildCreate("Remboursement", refund.best, false);
  const verifyRefund = buildVerify("Vérification de remboursement", verifyOf("refund", refund.best).best);
  if (createRefund && verifyRefund.value) {
    draft["refund"] = createRefund;
    draft["verifyRefund"] = verifyRefund.value;
    report.detected.push(`Remboursement : ${label(refund.best!)} (optionnel).`);
  } else if (createRefund) report.review.push("Remboursement détecté sans opération de vérification : ignoré.");
  if (draft["payout"] || draft["refund"]) {
    const values = [...verifyPayout.statuses, ...verifyRefund.statuses];
    draft["transferStatusMap"] = values.length ? mapStatuses([...new Set(values)], report.review, "Statuts de retrait") : {};
    if (!values.length) report.missing.push("Statuts de retrait/remboursement : valeurs non listées par la spécification.");
  }

  report.missing.push(...unmappedRequired);

  // Devises et pays : détectés seulement si la spécification les énumère.
  const currencies = new Set<string>();
  const scan = (node: unknown, depth = 0): void => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item === "XOF" || item === "XAF") currencies.add(item);
        else scan(item, depth + 1);
      }
    } else if (isRec(node)) for (const value of Object.values(node)) scan(value, depth + 1);
  };
  scan(input["paths"]);
  scan(components["schemas"]);
  draft["currencies"] = [...currencies];
  draft["countries"] = [];
  if (!currencies.size) report.missing.push("Devises (XOF, XAF) : non indiquées par la spécification.");
  report.missing.push("Pays couverts (codes ISO) : une spécification d'API ne les liste presque jamais.");

  // Webhooks : l'OpenAPI décrit au mieux le corps, jamais la signature.
  report.missing.push("Webhook : en-tête de signature, algorithme, encodage, charge signée et chemin de l'identifiant (rarement dans OpenAPI : voir la page « Webhooks » de la documentation).");

  return { draft, report };
}

export function formatReport(report: ImportReport): string[] {
  const lines: string[] = [];
  const block = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push("", title);
    for (const item of items) lines.push(`  - ${item}`);
  };
  block("Lu dans la spécification :", report.detected);
  block("À relire (déduit des noms, pas confirmé) :", report.review);
  block("À renseigner à la main (absent de la spécification) :", report.missing);
  return lines;
}
