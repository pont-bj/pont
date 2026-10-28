import type { Capability, Country, Operator, ProviderAdapter } from "@pont-bj/core";
import { FedaPayAdapter } from "@pont-bj/adapter-fedapay";
import { PawaPayAdapter } from "@pont-bj/adapter-pawapay";
import { PayDunyaAdapter } from "@pont-bj/adapter-paydunya";
import { KkiapayAdapter } from "@pont-bj/adapter-kkiapay";
import { CinetPayAdapter } from "@pont-bj/adapter-cinetpay";

export const COUNTRIES: Country[] = ["BJ", "TG", "CI", "SN", "BF", "ML", "NE", "GN", "CM", "CG", "CD", "GA"];
export const OPERATORS: Operator[] = [
  "mtn_bj", "moov_bj", "celtiis_bj", "moov_tg", "tmoney_tg",
  "mtn_ci", "orange_ci", "moov_ci", "wave_ci",
  "orange_sn", "free_sn", "wave_sn", "expresso_sn", "wizall_sn",
  "orange_bf", "moov_bf", "orange_ml", "moov_ml",
  "mtn_cm", "orange_cm", "mtn_cg", "airtel_cg", "airtel_ga",
];

const PROVIDER_NOTES: Record<string, string> = {
  fedapay: "Remboursement uniquement depuis le dashboard FedaPay.",
  pawapay: "Opérateur obligatoire. Orange Burkina : code de préautorisation (`preAuthorisationCode`) requis. Pas de cartes.",
  paydunya: "Retraits en XOF uniquement. Hash IPN faible : Pont revérifie toujours par API.",
  kkiapay: "Bénin uniquement. Ne peut pas être combiné avec un autre agrégateur (CGU Art. 18). Paiement via widget front.",
  cinetpay: "EXPÉRIMENTAL, désactivé par défaut : doc de vérification non confirmée, CGU non lues.",
};

/** Adaptateurs instanciés sans clé réelle : seule la méthode `supports` est utilisée (aucun appel réseau). */
function adapters(): ProviderAdapter[] {
  return [
    new FedaPayAdapter({ mode: "test", secretKey: "x", webhookSecret: "x" }),
    new PawaPayAdapter({ mode: "test", apiToken: "x" }),
    new PayDunyaAdapter({ mode: "test", masterKey: "x", privateKey: "x", token: "x", storeName: "x" }),
    new KkiapayAdapter({ mode: "test", publicKey: "x", privateKey: "x", secretKey: "x", webhookSecret: "x" }),
    new CinetPayAdapter({ mode: "test", apiKey: "x", siteId: "x" }),
  ];
}

export interface CoverageRow {
  country: Country;
  operator: Operator;
  provider: string;
  deposit: boolean;
  payout: boolean;
  refund: boolean;
}

const operatorCountry = (operator: Operator): string => operator.slice(operator.lastIndexOf("_") + 1).toUpperCase();

/** Couverture déclarée par le code des adaptateurs (capacités documentées), pas par un compte réel. */
export function coverage(filter: { country?: Country; operator?: Operator; capability?: Capability } = {}): {
  rows: CoverageRow[];
  notes: Record<string, string>;
} {
  const rows: CoverageRow[] = [];
  for (const adapter of adapters()) {
    for (const operator of OPERATORS) {
      const country = operatorCountry(operator) as Country;
      if (!COUNTRIES.includes(country)) continue;
      if (filter.country && filter.country !== country) continue;
      if (filter.operator && filter.operator !== operator) continue;
      const row: CoverageRow = {
        country,
        operator,
        provider: adapter.id,
        deposit: adapter.supports(country, operator, "deposit"),
        payout: adapter.supports(country, operator, "payout") && typeof adapter.createPayout === "function",
        refund: adapter.supports(country, operator, "refund") && typeof adapter.createRefund === "function",
      };
      if (!row.deposit && !row.payout && !row.refund) continue;
      if (filter.capability === "deposit" && !row.deposit) continue;
      if (filter.capability === "payout" && !row.payout) continue;
      if (filter.capability === "refund" && !row.refund) continue;
      rows.push(row);
    }
  }
  const providers = new Set(rows.map((row) => row.provider));
  return { rows, notes: Object.fromEntries(Object.entries(PROVIDER_NOTES).filter(([id]) => providers.has(id))) };
}

export interface ErrorExplanation {
  code: string;
  meaning: string;
  fix: string;
}

const ERRORS: Record<string, Omit<ErrorExplanation, "code">> = {
  invalid_request: { meaning: "La requête ne respecte pas le schéma (montant décimal, champ inconnu, clé d'idempotence absente…).", fix: "Lisez `messageFr` de l'erreur : il liste chaque champ fautif." },
  idempotency_conflict: { meaning: "La même clé d'idempotence a déjà servi avec un contenu différent.", fix: "Utilisez une clé par intention de paiement (ex. `order-<id>`) ; si le montant change, c'est une nouvelle intention, donc une nouvelle clé." },
  invalid_phone: { meaning: "Numéro invalide pour le pays.", fix: "Au Bénin, 10 chiffres depuis le 30/11/2024 (préfixe 01). Format accepté : +229 01…, 00229…, 01…" },
  no_provider_available: { meaning: "Aucun agrégateur configuré ne couvre ce pays / opérateur / opération.", fix: "Appelez l'outil `get_coverage`, puis configurez l'agrégateur adapté ou précisez `operator`." },
  invalid_signature: { meaning: "Webhook entrant dont la signature est invalide (rejeté en 401).", fix: "Vérifiez le secret webhook de l'agrégateur et que le corps n'est pas parsé avant Pont." },
  configuration_error: { meaning: "Configuration Pont invalide.", fix: "Lisez `messageFr` et `fix` ; ex. Kkiapay ne peut pas être combiné avec un autre agrégateur." },
  insufficient_funds: { meaning: "Solde du client insuffisant.", fix: "Proposez un autre moyen de paiement ou un montant plus faible." },
  declined_by_customer: { meaning: "Le client a refusé sur son téléphone.", fix: "Proposez de réessayer." },
  expired: { meaning: "Le client n'a jamais validé la demande.", fix: "Créez un nouveau paiement (nouvelle clé d'idempotence)." },
  provider_unavailable: { meaning: "L'agrégateur était indisponible avant l'envoi au client : rien n'a été débité.", fix: "Réessayez plus tard, ou activez `PONT_FAILOVER=true` avec un second agrégateur." },
  amount_mismatch: { meaning: "L'agrégateur confirme un paiement d'un montant différent de celui attendu (tentative de fraude possible).", fix: "Ne livrez pas. Le paiement est marqué à réconcilier : vérifiez dans le dashboard de l'agrégateur." },
  currency_mismatch: { meaning: "Devise confirmée différente de celle attendue.", fix: "Ne livrez pas ; vérifiez dans le dashboard de l'agrégateur." },
  attempt_mismatch: { meaning: "La transaction confirmée appartient à une autre tentative de paiement.", fix: "Ne livrez pas : quelqu'un tente de réutiliser une transaction. Vérifiez dans le dashboard." },
  adapter_error: { meaning: "Erreur inattendue dans l'adaptateur : on ignore si la demande est partie.", fix: "Le paiement est à réconcilier ; la réconciliation (cron) le réglera. Ne recréez pas de paiement pour la même commande." },
  amount_not_multiple_of_5: { meaning: "CinetPay exige un montant multiple de 5.", fix: "Arrondissez côté serveur de façon explicite, avant la création." },
  operator_required: { meaning: "PawaPay exige l'opérateur (`operator`).", fix: "Demandez l'opérateur au client ou déduisez-le de votre interface." },
  preauth_code_required: { meaning: "Orange Burkina (via PawaPay) exige un code à usage unique généré par le client AVANT le paiement.", fix: "Affichez : Composez *144*4*6# → montant → code PIN → code reçu par SMS ; puis recréez le paiement avec `preAuthorisationCode` (nouvelle clé d'idempotence). Instructions : PREAUTH_INSTRUCTIONS de @pont-bj/adapter-pawapay." },
  partial_refund_not_supported: { meaning: "Kkiapay ne rembourse que la totalité.", fix: "Remboursez la totalité ou passez par un virement manuel." },
  not_found: { meaning: "L'agrégateur ne connaît pas l'opération.", fix: "Si elle venait d'un statut ambigu, rien n'a été débité." },
};

export function explainError(code: string): ErrorExplanation | null {
  const entry = ERRORS[code];
  return entry ? { code, ...entry } : null;
}

export const ERROR_CODES = Object.keys(ERRORS);

export interface DocSection {
  id: string;
  title: string;
  body: string;
}

export const DOCS: DocSection[] = [
  {
    id: "quickstart",
    title: "Démarrage rapide",
    body: `1. \`npx pont init --agent\` (ou l'outil scaffold_integration) : génère lib/pont, la route des webhooks /api/pont/hooks/[provider], la route cron, un exemple d'action et .env.local en sandbox.
2. Installez \`@pont-bj/node\`.
3. Créez un paiement côté serveur : \`pont.createPayment({ amount, currency: "XOF", country: "BJ", customer: { phone }, reference }, idempotencyKey)\`.
4. Présentez \`payment.nextAction\` au client : redirect (URL), await_customer (valider sur le téléphone), client_widget (Kkiapay).
5. Livrez uniquement quand \`payment.status === "succeeded"\` (événement payment.succeeded).`,
  },
  {
    id: "sandbox",
    title: "Sandbox et numéros magiques",
    body: `PONT_SANDBOX=true : aucun compte agrégateur requis. Numéros (7 derniers chiffres) : 0000001 succès, 0000002 solde insuffisant, 0000003 jamais confirmé (expire), 0000004 webhook en double, 0000005 webhook en retard, 0000006 agrégateur indisponible avant envoi (failover), 0000007 timeout ambigu (à réconcilier), 0000008 refus du client. Exemple Bénin : +2290100000001.`,
  },
  {
    id: "securite",
    title: "Règles de sécurité",
    body: `Montant fixé côté serveur ; clé d'idempotence sur chaque création ; ne jamais livrer sur l'URL de retour ni sur le contenu d'un webhook ; webhooks lus en corps brut ; aucun secret avec NEXT_PUBLIC_ ; .env hors de git. Pont relit chaque succès auprès de l'agrégateur et contrôle montant, devise et tentative. Lancez \`pont doctor\` (outil run_doctor) avant le live.`,
  },
  {
    id: "webhooks",
    title: "Webhooks",
    body: `Entrants (agrégateurs → votre app) : route /api/pont/hooks/[provider] avec createWebhookRoute(pont). 401 si signature invalide, 200 sinon (doublons ignorés). Sortants (Pont → votre app) : en-tête Pont-Signature: t=<unix>,v1=<hmac_sha256(t.body)>, vérifiez avec verifyPontSignature(secret, rawBody, header). Reprises sur ~3 jours.`,
  },
  {
    id: "retraits-remboursements",
    title: "Retraits et remboursements",
    body: `pont.createPayout({ amount, currency, country, operator, recipient: { phone }, reference }, key) : opérateur obligatoire, pas de failover. pont.createRefund(paymentId, { amount? }, key) : total par défaut, partiels cumulés jamais au-delà du montant payé. FedaPay : remboursement par dashboard uniquement. Kkiapay : total uniquement.`,
  },
  {
    id: "stockage",
    title: "Stockage et réconciliation",
    body: `En live, un stockage persistant est obligatoire (option stores de createPontFromEnv). @pont-bj/store-convex fournit tous les stores ; copiez convex/pontStore.ts, fusionnez pontTables dans votre schéma, définissez PONT_STORE_SECRET (32+ caractères) des deux côtés. Le cron /api/pont/cron (toutes les 5 min, Authorization: Bearer CRON_SECRET) réconcilie les opérations incertaines et livre les webhooks.`,
  },
  {
    id: "variables",
    title: "Variables d'environnement",
    body: `PONT_MODE (test|live), PONT_SANDBOX, PONT_PUBLIC_URL, PONT_FAILOVER, CRON_SECRET ; FEDAPAY_SECRET_KEY + FEDAPAY_WEBHOOK_SECRET ; PAWAPAY_API_TOKEN (+ PAWAPAY_CALLBACK_PUBLIC_KEYS pour exiger les callbacks signés) ; PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN, PAYDUNYA_STORE_NAME ; KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET_KEY, KKIAPAY_WEBHOOK_SECRET ; PONT_ENABLE_CINETPAY + CINETPAY_API_KEY, CINETPAY_SITE_ID (expérimental).`,
  },
];

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Recherche plein texte simple : score = occurrences des mots de la requête. */
export function searchDocs(query: string, limit = 3): DocSection[] {
  const terms = normalize(query).split(/\W+/).filter((term) => term.length > 2);
  if (terms.length === 0) return DOCS.slice(0, limit);
  return DOCS.map((section) => {
    const haystack = normalize(`${section.title} ${section.body}`);
    const score = terms.reduce((sum, term) => sum + (haystack.split(term).length - 1), 0);
    return { section, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.section);
}
