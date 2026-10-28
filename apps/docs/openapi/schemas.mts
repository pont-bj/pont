// Schémas JSON de l'API Pont, alignés sur le code (packages/core/src/schemas.ts, types.ts, server/src/*).
type Schema = Record<string, unknown>;

const str = (description?: string, extra: Schema = {}): Schema => ({ type: "string", ...(description ? { description } : {}), ...extra });
const int = (description?: string, extra: Schema = {}): Schema => ({ type: "integer", ...(description ? { description } : {}), ...extra });
const bool = (description?: string): Schema => ({ type: "boolean", ...(description ? { description } : {}) });
const arr = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: Schema): Schema => ({ oneOf: [schema, { type: "null" }] });
const obj = (properties: Record<string, Schema>, required: string[] = [], extra: Schema = {}): Schema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  ...extra,
});

export const COUNTRIES = ["BJ", "TG", "CI", "SN", "BF", "ML", "NE", "GN", "CM", "CG", "CD", "GA"];
export const OPERATORS = [
  "mtn_bj", "moov_bj", "celtiis_bj", "moov_tg", "tmoney_tg",
  "mtn_ci", "orange_ci", "moov_ci", "wave_ci",
  "orange_sn", "free_sn", "wave_sn", "expresso_sn", "wizall_sn",
  "orange_bf", "moov_bf", "orange_ml", "moov_ml",
  "mtn_cm", "orange_cm", "mtn_cg", "airtel_cg", "airtel_ga",
];

const money = (description: string): Schema => int(description, { minimum: 1, examples: [5000] });

const person = (who: string): Schema =>
  obj(
    {
      phone: str(`Numéro du ${who} au format international (E.164), 6 à 20 caractères.`, { minLength: 6, maxLength: 20, examples: ["+2290100000001"] }),
      name: str(`Nom du ${who}.`, { maxLength: 120, examples: ["Awa Kpossou"] }),
      email: str(`Adresse e-mail du ${who}.`, { format: "email", examples: ["awa@exemple.bj"] }),
    },
    ["phone"],
  );

const providerRecordCommon = {
  mode: str("Mode du serveur au moment de la création.", { enum: ["test", "live"] }),
  country: str("Pays (ISO 3166-1 alpha-2).", { enum: COUNTRIES }),
  currency: ref("Currency"),
  provider: str("Agrégateur choisi par Pont (`fedapay`, `pawapay`, `paydunya`, `kkiapay`, `sandbox` ou un agrégateur personnalisé).", { examples: ["fedapay"] }),
  attemptId: str("Identifiant unique de la tentative, transmis à l'agrégateur quand il l'accepte."),
  providerRef: nullable(str("Référence de l'opération chez l'agrégateur.")),
  failureCode: nullable(str("Code d'échec normalisé, `null` tant qu'il n'y a pas d'échec.")),
  needsReconciliation: bool("`true` quand l'état réel chez l'agrégateur est inconnu : Pont vérifie à chaque cycle, ne réessaie jamais ailleurs."),
  metadata: { type: "object", additionalProperties: str(undefined, { maxLength: 500 }), description: "Vos métadonnées libres (valeurs de 500 caractères au plus)." },
  createdAt: int("Date de création, en millisecondes Unix."),
  updatedAt: int("Dernière mise à jour, en millisecondes Unix."),
};

export const schemas: Record<string, Schema> = {
  Currency: str("Devise : le XOF et le XAF n'ont pas de décimales, les montants sont des entiers.", { enum: ["XOF", "XAF"] }),
  Country: str("Pays (ISO 3166-1 alpha-2).", { enum: COUNTRIES }),
  Operator: str("Opérateur Mobile Money (`<opérateur>_<pays>`), indépendant des codes des agrégateurs.", { enum: OPERATORS }),
  PaymentStatus: str("Statut normalisé d'un paiement. Seul `succeeded` est vérifié auprès de l'agrégateur.", {
    enum: ["created", "pending", "processing", "succeeded", "failed", "expired", "cancelled", "refunded", "partially_refunded"],
  }),
  TransferStatus: str("Statut d'un retrait ou d'un remboursement.", { enum: ["pending", "processing", "succeeded", "failed", "cancelled"] }),

  Error: obj(
    {
      error: obj(
        {
          code: str("Code stable à tester côté application.", { examples: ["invalid_request"] }),
          message: str("Message en français, destiné à un humain."),
          fix: str("Piste de correction, quand elle existe."),
        },
        ["code", "message"],
      ),
    },
    ["error"],
  ),
  LimitError: obj(
    {
      error: obj(
        {
          code: str(undefined, { enum: ["limit_exceeded"] }),
          limit: str("Plafond atteint.", { enum: ["frozen", "max_single", "max_balance", "max_daily_out", "max_monthly_out", "unknown_tier"] }),
          message: str(),
        },
        ["code", "limit", "message"],
      ),
    },
    ["error"],
  ),
  InsufficientFundsError: obj(
    {
      error: obj(
        { code: str(undefined, { enum: ["insufficient_funds"] }), available: int("Solde disponible."), required: int("Montant demandé, frais compris."), message: str() },
        ["code", "available", "required", "message"],
      ),
    },
    ["error"],
  ),

  CreatePaymentRequest: obj(
    {
      amount: money("Montant en unités entières de la devise."),
      currency: ref("Currency"),
      country: ref("Country"),
      customer: person("client"),
      reference: str("Votre référence (commande, facture), 1 à 64 caractères. Sert aussi de clé d'idempotence par défaut.", { minLength: 1, maxLength: 64, examples: ["commande-42"] }),
      method: str("Moyen de paiement.", { enum: ["mobile_money", "card"] }),
      operator: ref("Operator"),
      description: str("Libellé affiché au client, 255 caractères au plus.", { maxLength: 255, examples: ["Commande 42"] }),
      returnUrl: str("Adresse où ramener le client après un paiement hébergé.", { format: "uri" }),
      metadata: { type: "object", additionalProperties: str(undefined, { maxLength: 500 }), description: "Métadonnées libres, renvoyées dans les réponses et les webhooks." },
      preAuthorisationCode: str("Code à usage unique généré avant le paiement (Orange Burkina via PawaPay) : 1 à 36 caractères alphanumériques.", { pattern: "^[A-Za-z0-9]{1,36}$" }),
    },
    ["amount", "currency", "country", "customer", "reference"],
    { additionalProperties: false },
  ),
  NextAction: {
    description: "Ce que votre application doit faire ensuite, selon l'agrégateur.",
    oneOf: [
      obj({ type: str(undefined, { enum: ["redirect"] }), url: str("Page de paiement hébergée.", { format: "uri" }) }, ["type", "url"]),
      obj({ type: str(undefined, { enum: ["await_customer"] }), message: str("Le client valide la demande reçue sur son téléphone (push USSD).") }, ["type", "message"]),
      obj({ type: str(undefined, { enum: ["preauth_code_required"] }), instructions: str() }, ["type", "instructions"]),
      obj(
        {
          type: str(undefined, { enum: ["client_widget"] }),
          provider: str(),
          publicKey: str(),
          sandbox: bool(),
          amount: int(),
          partnerId: str(),
        },
        ["type", "provider", "publicKey", "sandbox", "amount", "partnerId"],
      ),
    ],
    discriminator: { propertyName: "type" },
  },
  Payment: obj(
    {
      id: str("Identifiant Pont.", { examples: ["pay_84a49a19050240ebb01077bdb806c672"] }),
      ...providerRecordCommon,
      status: ref("PaymentStatus"),
      amount: int("Montant en unités entières."),
      operator: nullable(ref("Operator")),
      reference: str("Votre référence."),
      nextAction: nullable(ref("NextAction")),
    },
    ["id", "mode", "status", "amount", "currency", "country", "provider", "attemptId", "providerRef", "operator", "reference", "nextAction", "failureCode", "needsReconciliation", "metadata", "createdAt", "updatedAt"],
  ),

  CreatePayoutRequest: obj(
    {
      amount: money("Montant en unités entières de la devise."),
      currency: ref("Currency"),
      country: ref("Country"),
      operator: ref("Operator"),
      recipient: person("bénéficiaire"),
      reference: str("Votre référence, 1 à 64 caractères. Sert aussi de clé d'idempotence par défaut.", { minLength: 1, maxLength: 64, examples: ["salaire-oct-12"] }),
      description: str(undefined, { maxLength: 255 }),
      metadata: { type: "object", additionalProperties: str(undefined, { maxLength: 500 }) },
    },
    ["amount", "currency", "country", "operator", "recipient", "reference"],
    { additionalProperties: false },
  ),
  Payout: obj(
    {
      id: str(undefined, { examples: ["po_f6be299eb1f44d63a8d4a588965ce39e"] }),
      ...providerRecordCommon,
      status: ref("TransferStatus"),
      amount: int(),
      operator: ref("Operator"),
      recipientPhone: str("Numéro du bénéficiaire."),
      reference: str(),
    },
    ["id", "mode", "status", "amount", "currency", "country", "operator", "provider", "attemptId", "providerRef", "recipientPhone", "reference", "failureCode", "needsReconciliation", "metadata", "createdAt", "updatedAt"],
  ),

  CreateRefundRequest: obj(
    { amount: int("Montant à rembourser. Sans montant : remboursement du restant.", { minimum: 1, examples: [2000] }) },
    [],
    { additionalProperties: false },
  ),
  Refund: obj(
    {
      id: str(undefined, { examples: ["re_3c1f0a9e2b7d4e56a8f1c0d2e4b69a77"] }),
      mode: str(undefined, { enum: ["test", "live"] }),
      paymentId: str("Paiement remboursé."),
      status: ref("TransferStatus"),
      amount: int(),
      currency: ref("Currency"),
      provider: str(),
      attemptId: str(),
      providerRef: nullable(str()),
      failureCode: nullable(str()),
      needsReconciliation: bool(),
      createdAt: int(),
      updatedAt: int(),
    },
    ["id", "mode", "paymentId", "status", "amount", "currency", "provider", "attemptId", "providerRef", "failureCode", "needsReconciliation", "createdAt", "updatedAt"],
  ),

  Wallet: obj(
    {
      userId: str("Identifiant de l'utilisateur dans votre application.", { pattern: "^[A-Za-z0-9_-]{1,64}$", examples: ["awa"] }),
      currency: ref("Currency"),
      available: int("Solde disponible."),
      held: int("Montant bloqué (retraits en cours)."),
      tier: nullable(str("Palier KYC (`basique`, `complet` par défaut).")),
      frozen: bool("Un compte gelé ne peut plus rien sortir."),
    },
    ["userId", "currency", "available", "held", "tier", "frozen"],
  ),
  WalletProfileRequest: obj(
    { tier: str("Palier KYC, 1 à 32 caractères.", { minLength: 1, maxLength: 32, examples: ["complet"] }), frozen: bool("Gèle ou dégèle le compte.") },
    [],
    { additionalProperties: false },
  ),
  Movement: obj(
    {
      entryId: str("Écriture du registre."),
      accountId: str(),
      direction: str("`credit` augmente le solde disponible, `debit` le diminue.", { enum: ["debit", "credit"] }),
      amount: int(),
      createdAt: int(),
    },
    ["entryId", "accountId", "direction", "amount", "createdAt"],
  ),
  DepositRequest: obj(
    {
      amount: money("Montant à encaisser."),
      country: ref("Country"),
      phone: str("Numéro du payeur (E.164).", { minLength: 6, maxLength: 20, examples: ["+2290100000001"] }),
      operator: ref("Operator"),
      reference: str("Votre référence, 1 à 64 caractères.", { minLength: 1, maxLength: 64, examples: ["depot-1"] }),
    },
    ["amount", "country", "phone", "reference"],
    { additionalProperties: false },
  ),
  WithdrawalRequest: obj(
    {
      amount: money("Montant reçu par le bénéficiaire (les frais s'ajoutent au débit)."),
      country: ref("Country"),
      phone: str("Numéro du bénéficiaire (E.164).", { minLength: 6, maxLength: 20, examples: ["+2290100000001"] }),
      operator: ref("Operator"),
      reference: str("Votre référence, 1 à 64 caractères.", { minLength: 1, maxLength: 64, examples: ["retrait-1"] }),
    },
    ["amount", "country", "phone", "operator", "reference"],
    { additionalProperties: false },
  ),
  WithdrawalResult: obj(
    {
      id: str("Exécution du workflow `wallet.withdraw`.", { examples: ["wfr_93b8690f49654ceb9f594af721302033"] }),
      status: str(undefined, { enum: ["succeeded"] }),
      payoutId: nullable(str("Retrait envoyé à l'agrégateur.")),
      amount: int(),
      fee: int("Frais prélevés (`PONT_WITHDRAWAL_FEE_BPS`)."),
    },
    ["id", "status", "payoutId", "amount", "fee"],
  ),
  TransferRequest: obj(
    {
      from: str("Utilisateur débité.", { pattern: "^[A-Za-z0-9_-]{1,64}$", examples: ["awa"] }),
      to: str("Utilisateur crédité.", { pattern: "^[A-Za-z0-9_-]{1,64}$", examples: ["koffi"] }),
      amount: money("Montant transféré."),
      fee: int("Frais à la charge de l'expéditeur.", { minimum: 0 }),
      reference: str("Votre référence, 1 à 64 caractères. Sert aussi de clé d'idempotence.", { minLength: 1, maxLength: 64, examples: ["transfert-1"] }),
    },
    ["from", "to", "amount", "reference"],
    { additionalProperties: false },
  ),
  TransferResult: obj({ from: ref("Wallet"), to: ref("Wallet") }, ["from", "to"]),

  LedgerLine: obj({ account: str("Code du compte, par exemple `wallet:awa:XOF:available`."), direction: str(undefined, { enum: ["debit", "credit"] }), amount: int() }, ["account", "direction", "amount"]),
  LedgerEntry: obj(
    {
      id: str(),
      description: str(),
      createdAt: int(),
      reverses: nullable(str("Écriture annulée par celle-ci.")),
      lines: arr(ref("LedgerLine"), "Lignes équilibrées : total des débits = total des crédits."),
    },
    ["id", "description", "createdAt", "reverses", "lines"],
  ),
  Ledger: obj(
    {
      currency: ref("Currency"),
      system: arr(obj({ code: str("`system:transit:<agrégateur>:<devise>` ou `system:fees:<devise>`."), balance: int(), currency: ref("Currency") }, ["code", "balance", "currency"]), "Comptes système."),
      entries: arr(ref("LedgerEntry"), "Dernières écritures, la plus récente d'abord."),
    },
    ["currency", "system", "entries"],
  ),

  Overview: obj(
    {
      sandbox: bool("Le sandbox est actif : aucun agrégateur n'est contacté."),
      mode: str(undefined, { enum: ["test", "live"] }),
      features: obj({ wallet: bool("Portefeuilles et registre disponibles (stockage PostgreSQL).") }, ["wallet"]),
      payments: obj(
        { recent: arr(ref("Payment")), count: int("Paiements parmi les 200 derniers."), succeeded: int(), volume: int("Montant des paiements réussis parmi les 200 derniers.") },
        ["recent", "count", "succeeded", "volume"],
      ),
      payouts: obj({ recent: arr(ref("Payout")), count: int() }, ["recent", "count"]),
    },
    ["sandbox", "mode", "features", "payments", "payouts"],
  ),
  TimelineStep: obj(
    {
      at: int(),
      kind: str(undefined, { enum: ["created", "status", "refund", "webhook"] }),
      title: str(),
      detail: str(),
      tone: str(undefined, { enum: ["neutral", "success", "danger", "info"] }),
    },
    ["at", "kind", "title", "detail", "tone"],
  ),
  PaymentDetail: obj({ payment: ref("Payment"), refunds: arr(ref("Refund")), timeline: arr(ref("TimelineStep"), "Chronologie construite uniquement à partir de ce que Pont a enregistré.") }, ["payment", "refunds", "timeline"]),
  CoverageCountry: obj(
    {
      country: ref("Country"),
      operators: arr(ref("Operator")),
      deposit: arr(str(), "Agrégateurs qui encaissent dans ce pays."),
      payout: arr(str()),
      refund: arr(str()),
    },
    ["country", "operators", "deposit", "payout", "refund"],
  ),
  ProviderHealth: obj(
    {
      provider: str(),
      capabilities: arr(str(undefined, { enum: ["deposit", "payout", "refund"] })),
      countries: int(),
      lastHour: nullable(obj({ settled: int(), succeeded: int(), rate: { type: "number", minimum: 0, maximum: 1 } }, ["settled", "succeeded", "rate"])),
      needsReconciliation: int("Paiements à réconcilier."),
    },
    ["provider", "capabilities", "countries", "lastHour", "needsReconciliation"],
  ),

  ProviderField: obj(
    {
      name: str("Nom du champ à envoyer à `PUT /admin/providers/{id}`."),
      label: str(),
      secret: bool("Un secret n'est jamais renvoyé en entier."),
      required: bool(),
      set: bool(),
      value: nullable(str("Secret masqué (`••••1234`) ou valeur en clair pour un champ non secret.")),
    },
    ["name", "label", "secret", "required", "set", "value"],
  ),
  ProviderView: obj(
    {
      id: str(undefined, { examples: ["fedapay"] }),
      custom: bool("`true` pour un agrégateur personnalisé chargé depuis `PONT_PLUGINS_DIR`."),
      label: str(),
      source: str("`vault` : saisi dans le dashboard ; `env` : variables d'environnement ; `none` : non configuré.", { enum: ["vault", "env", "none"] }),
      configured: bool(),
      webhookUrl: str("URL à déclarer chez l'agrégateur.", { format: "uri" }),
      fields: arr(ref("ProviderField")),
    },
    ["id", "label", "source", "configured", "webhookUrl", "fields"],
  ),
  ProvidersList: obj(
    {
      vault: bool("Le coffre est actif (`PONT_ENCRYPTION_KEY` défini)."),
      data: arr(ref("ProviderView")),
      pluginErrors: arr(obj({ dir: str(), message: str() }, ["dir", "message"]), "Plugins qui n'ont pas pu être chargés."),
    },
    ["vault", "data", "pluginErrors"],
  ),
  Delivery: obj(
    {
      id: str(undefined, { examples: ["whd_5bbd65568c4a446fb538f9a11d10e3a4"] }),
      endpointId: str(),
      url: str(undefined, { format: "uri" }),
      status: str(undefined, { enum: ["pending", "delivered", "failed"] }),
      attempts: int("Nombre de tentatives."),
      lastError: nullable(str()),
      lastHttpStatus: nullable(int()),
      eventType: nullable(str(undefined, { examples: ["payment.succeeded"] })),
      createdAt: int(),
      nextAttemptAt: nullable(int()),
    },
    ["id", "endpointId", "url", "status", "attempts", "lastError", "lastHttpStatus", "eventType", "createdAt", "nextAttemptAt"],
  ),
  WebhooksView: obj(
    {
      vault: bool(),
      inbound: arr(obj({ provider: str(), url: str(undefined, { format: "uri" }) }, ["provider", "url"]), "URL à déclarer chez les agrégateurs."),
      endpoints: arr(
        obj({ id: str(), url: str(undefined, { format: "uri" }), source: str(undefined, { enum: ["env", "vault"] }), createdAt: nullable(int()) }, ["id", "url", "source", "createdAt"]),
        "Destinataires de vos événements.",
      ),
      deliveries: arr(ref("Delivery"), "50 dernières livraisons."),
    },
    ["vault", "inbound", "endpoints", "deliveries"],
  ),
  EndpointCreated: obj(
    { id: str(undefined, { examples: ["ep_758013f8ac09"] }), url: str(undefined, { format: "uri" }), secret: str("Secret de signature `whsec_…`, affiché une seule fois.") },
    ["id", "url", "secret"],
  ),

  PontEvent: obj(
    {
      id: str("Identifiant unique de l'événement (aussi dans l'en-tête `Pont-Event-Id`) : dédoublonnez dessus.", { examples: ["evt_5d0c6f4e8a2b4b1f9a3c7e1d0b2a6f48"] }),
      type: str("Type d'événement.", {
        enum: [
          "payment.pending", "payment.processing", "payment.succeeded", "payment.failed", "payment.expired", "payment.cancelled",
          "payment.refunded", "payment.partially_refunded", "payment.needs_reconciliation",
          "payout.pending", "payout.processing", "payout.succeeded", "payout.failed", "payout.cancelled", "payout.needs_reconciliation",
          "refund.pending", "refund.processing", "refund.succeeded", "refund.failed", "refund.cancelled", "refund.needs_reconciliation",
        ],
      }),
      object: str("Nature de l'objet dans `data`.", { enum: ["payment", "payout", "refund"] }),
      created_at: int("Date de l'événement, en millisecondes Unix."),
      data: obj(
        {
          id: str(),
          status: str(),
          amount: int(),
          currency: ref("Currency"),
          country: ref("Country"),
          provider: str(),
          operator: nullable(str()),
          reference: str(),
          failure_code: nullable(str()),
          needs_reconciliation: bool(),
          metadata: { type: "object", additionalProperties: str() },
        },
        ["id", "status"],
        { description: "L'objet concerné, sans identifiant interne de tentative ni action client. Un remboursement porte `payment_id` à la place de `reference` et `country`." },
      ),
    },
    ["id", "type", "object", "created_at", "data"],
  ),

  EmailConfigRequest: obj(
    {
      host: str("Serveur SMTP.", { minLength: 1, maxLength: 255, examples: ["smtp.exemple.bj"] }),
      port: int("Port SMTP.", { minimum: 1, maximum: 65535, examples: [587] }),
      security: str("`none` : sans chiffrement (réseau local) ; `starttls` : port 587 ; `tls` : port 465.", { enum: ["none", "starttls", "tls"] }),
      user: str("Identifiant SMTP.", { maxLength: 255 }),
      password: str("Mot de passe SMTP. Omis ou vide : l'ancien est conservé.", { maxLength: 1000 }),
      from: str("Adresse d'expédition : `contact@exemple.bj` ou `Pont <contact@exemple.bj>`.", { minLength: 3, maxLength: 255, examples: ["Pont <contact@exemple.bj>"] }),
    },
    ["host", "port", "security", "from"],
  ),
  EmailView: obj(
    {
      vault: bool(),
      configured: bool(),
      host: nullable(str()),
      port: nullable(int()),
      security: nullable(str(undefined, { enum: ["none", "starttls", "tls"] })),
      user: nullable(str()),
      from: nullable(str()),
      passwordSet: bool("Le mot de passe n'est jamais renvoyé : seulement s'il existe."),
    },
    ["configured", "host", "port", "security", "user", "from", "passwordSet"],
  ),
  AlertRule: obj(
    {
      id: str(undefined, { enum: ["payment_failed", "webhook_failed", "payout_stuck", "low_balance", "admin_login"] }),
      label: str(),
      description: str(),
      enabled: bool(),
    },
    ["id", "label", "description", "enabled"],
  ),
  AlertsConfigRequest: obj(
    {
      rules: { type: "object", additionalProperties: bool(), description: "Règle activée ou non, par identifiant (`payment_failed`, `webhook_failed`, `payout_stuck`, `low_balance`, `admin_login`)." },
      recipients: arr(str(undefined, { format: "email" }), "Destinataires, 20 au plus."),
      lowBalanceThreshold: int("Seuil du compte de transit pour la règle `low_balance`."),
    },
    [],
  ),
  AlertsView: obj(
    {
      vault: bool(),
      emailConfigured: bool(),
      rules: arr(ref("AlertRule")),
      recipients: arr(str(undefined, { format: "email" })),
      lowBalanceThreshold: int(),
      history: arr(
        obj(
          {
            id: str(),
            rule: str(),
            title: str(),
            detail: str(),
            at: int(),
            status: str(undefined, { enum: ["sent", "failed"] }),
            error: str("Présent si l'envoi a échoué."),
          },
          ["id", "rule", "title", "detail", "at", "status"],
        ),
        "50 dernières alertes.",
      ),
    },
    ["vault", "emailConfigured", "rules", "recipients", "lowBalanceThreshold", "history"],
  ),
};

export { arr, bool, int, nullable, obj, ref, str };
export type { Schema };
