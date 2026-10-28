// Génère public/openapi.json (OpenAPI 3.1) à partir des schémas alignés sur le code de Pont.
import { mkdirSync, writeFileSync } from "node:fs";
import { schemas, ref, type Schema } from "./schemas.mts";

const json = (schema: Schema, example?: unknown) => ({ "application/json": { schema, ...(example !== undefined ? { example } : {}) } });
const errRef = (description: string, schema = "Error") => ({ description, content: json(ref(schema)) });
const errors = (...codes: Array<[number, string, string?]>) =>
  Object.fromEntries(codes.map(([code, description, schema]) => [String(code), errRef(description, schema)]));

const api = [{ ApiKey: [] }];
const admin = [{ AdminToken: [] }];
const idem = { name: "Idempotency-Key", in: "header", required: false, description: "Clé d'idempotence (8 à 255 caractères). Sans elle, Pont utilise `auto:<type>:<reference>`.", schema: { type: "string", minLength: 8, maxLength: 255 } };
const idParam = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: { type: "string" } });
const limit = { name: "limit", in: "query", required: false, description: "Nombre d'éléments (1 à 200, 50 par défaut).", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } };
const user = idParam("user", "Identifiant de l'utilisateur (`A-Z a-z 0-9 _ -`, 64 caractères au plus).");

const authErrors = errors([401, "Clé absente ou invalide."]);
const walletErrors = {
  ...errors([400, "Requête invalide."], [401, "Clé absente ou invalide."], [501, "Le stockage choisi n'a pas de registre (mode Convex). Utilisez PostgreSQL."]),
  "422": {
    description: "Plafond atteint ou solde insuffisant.",
    content: json({ oneOf: [ref("LimitError"), ref("InsufficientFundsError"), ref("Error")] }),
  },
};

const sampleError = (code: string, message: string) => ({ error: { code, message } });

const op = (tag: string, summary: string, description: string, extra: Record<string, unknown>) => ({ tags: [tag], summary, description, ...extra });

const paths: Record<string, unknown> = {
  "/health": {
    get: op("Santé", "Vérifier que le serveur répond", "Sans authentification. Utile pour les sondes Docker ou de supervision.", {
      operationId: "getHealth",
      security: [],
      responses: { "200": { description: "Le serveur répond.", content: json({ type: "object", properties: { status: { type: "string", enum: ["ok"] } } }, { status: "ok" }) } },
    }),
  },
  "/hooks/{provider}": {
    post: op("Webhooks entrants", "Recevoir le webhook d'un agrégateur", "À déclarer chez l'agrégateur (`<PONT_PUBLIC_URL>/hooks/<agrégateur>`). Pont vérifie la signature, puis **interroge l'agrégateur** avant de passer un paiement à `succeeded` : le corps du webhook seul ne suffit jamais.", {
      operationId: "receiveProviderWebhook",
      security: [],
      parameters: [idParam("provider", "Identifiant de l'agrégateur : `fedapay`, `pawapay`, `paydunya`, `kkiapay` ou un agrégateur personnalisé.")],
      requestBody: { required: true, description: "Corps brut envoyé par l'agrégateur, dans son format.", content: { "application/json": { schema: { type: "object" } } } },
      responses: {
        "200": { description: "Webhook accepté.", content: json({ type: "object", properties: { received: { type: "boolean" }, status: { type: "string" } } }, { received: true, status: "succeeded" }) },
        "401": errRef("Signature invalide."),
        "404": errRef("Agrégateur inconnu ou non configuré."),
        "500": errRef("Erreur interne."),
      },
    }),
  },

  "/v1/payments": {
    post: op("Paiements", "Créer un paiement", "Encaisse un client. La `reference` sert d'idempotence : la même référence avec le même contenu renvoie le même paiement, sans double débit ; avec un contenu différent, `409`. Montants **entiers** (XOF/XAF n'ont pas de décimales).", {
      operationId: "createPayment",
      security: api,
      parameters: [idem],
      requestBody: {
        required: true,
        content: json(ref("CreatePaymentRequest"), { amount: 5000, currency: "XOF", country: "BJ", customer: { phone: "+2290100000001" }, reference: "commande-42" }),
      },
      responses: {
        "201": {
          description: "Paiement créé.",
          content: json(ref("Payment"), {
            id: "pay_84a49a19050240ebb01077bdb806c672", mode: "test", status: "pending", amount: 5000, currency: "XOF", country: "BJ", provider: "sandbox",
            attemptId: "466a0f26-3cde-4876-938e-1e97db9e4c17", providerRef: "sbx_466a0f26-3cde-4876-938e-1e97db9e4c17", operator: null, reference: "commande-42",
            nextAction: { type: "await_customer", message: "Validez le paiement sur votre téléphone (simulation)." },
            failureCode: null, needsReconciliation: false, metadata: {}, createdAt: 1792000000000, updatedAt: 1792000000000,
          }),
        },
        ...errors([400, "Requête invalide ou `reference` absente."], [401, "Clé absente ou invalide."], [409, "Même référence avec un contenu différent (`idempotency_conflict`)."], [422, "Montant refusé, numéro invalide ou aucun agrégateur disponible."], [502, "L'agrégateur a refusé la demande."]),
      },
    }),
  },
  "/v1/payments/{id}": {
    get: op("Paiements", "Lire un paiement", "Renvoie l'état connu par Pont, sans appeler l'agrégateur. Utilisez `refresh` pour le vérifier.", {
      operationId: "getPayment",
      security: api,
      parameters: [idParam("id", "Identifiant Pont du paiement (`pay_…`).")],
      responses: { "200": { description: "Le paiement.", content: json(ref("Payment")) }, ...errors([401, "Clé absente ou invalide."], [404, "Paiement introuvable (`payment_not_found`)."]) },
    }),
  },
  "/v1/payments/{id}/refresh": {
    post: op("Paiements", "Vérifier un paiement chez l'agrégateur", "Interroge l'agrégateur et met à jour le statut. Un paiement ne passe à `succeeded` qu'après cette vérification.", {
      operationId: "refreshPayment",
      security: api,
      parameters: [idParam("id", "Identifiant Pont du paiement.")],
      responses: { "200": { description: "Le paiement à jour.", content: json(ref("Payment")) }, ...errors([401, "Clé absente ou invalide."], [404, "Paiement introuvable."], [502, "L'agrégateur est injoignable ou a refusé."]) },
    }),
  },
  "/v1/payments/{id}/refunds": {
    post: op("Paiements", "Rembourser un paiement", "Sans `amount`, rembourse le montant restant. Seul un paiement `succeeded` se rembourse. Le sandbox ne gère pas les remboursements : `422 no_provider_available`.", {
      operationId: "createRefund",
      security: api,
      parameters: [idParam("id", "Identifiant Pont du paiement."), idem],
      requestBody: { required: false, content: json(ref("CreateRefundRequest"), { amount: 2000 }) },
      responses: { "201": { description: "Remboursement créé.", content: json(ref("Refund")) }, ...errors([400, "Paiement non remboursable ou montant supérieur au restant."], [401, "Clé absente ou invalide."], [404, "Paiement introuvable."], [422, "Aucun agrégateur disponible pour rembourser."]) },
    }),
  },

  "/v1/payouts": {
    post: op("Retraits", "Envoyer de l'argent", "Envoie de l'argent vers un numéro Mobile Money. La `reference` sert d'idempotence.", {
      operationId: "createPayout",
      security: api,
      parameters: [idem],
      requestBody: { required: true, content: json(ref("CreatePayoutRequest"), { amount: 10000, currency: "XOF", country: "BJ", operator: "mtn_bj", recipient: { phone: "+2290100000001" }, reference: "salaire-oct-12" }) },
      responses: { "201": { description: "Retrait créé.", content: json(ref("Payout")) }, ...errors([400, "Requête invalide."], [401, "Clé absente ou invalide."], [409, "Même référence avec un contenu différent."], [422, "Montant refusé, numéro invalide ou aucun agrégateur."], [502, "L'agrégateur a refusé."]) },
    }),
  },
  "/v1/payouts/{id}": {
    get: op("Retraits", "Lire un retrait", "État connu par Pont.", {
      operationId: "getPayout",
      security: api,
      parameters: [idParam("id", "Identifiant Pont du retrait (`po_…`).")],
      responses: { "200": { description: "Le retrait.", content: json(ref("Payout")) }, ...errors([401, "Clé absente ou invalide."], [404, "Retrait introuvable."]) },
    }),
  },
  "/v1/payouts/{id}/refresh": {
    post: op("Retraits", "Vérifier un retrait chez l'agrégateur", "Interroge l'agrégateur et met à jour le statut.", {
      operationId: "refreshPayout",
      security: api,
      parameters: [idParam("id", "Identifiant Pont du retrait.")],
      responses: { "200": { description: "Le retrait à jour.", content: json(ref("Payout")) }, ...errors([401, "Clé absente ou invalide."], [404, "Retrait introuvable."], [502, "L'agrégateur est injoignable."]) },
    }),
  },

  "/v1/wallets/{user}": {
    put: op("Portefeuilles", "Créer ou configurer un portefeuille", "Crée le portefeuille d'un utilisateur s'il n'existe pas. Palier par défaut : `basique`. Les paliers `basique` (solde 200 000, par opération 50 000, sorties 100 000/jour et 500 000/mois) et `complet` (2 000 000, 500 000, 1 000 000, 5 000 000) sont fournis. Un transfert exige un palier sur les deux portefeuilles.", {
      operationId: "putWallet",
      security: api,
      parameters: [user],
      requestBody: { required: false, content: json(ref("WalletProfileRequest"), { tier: "complet" }) },
      responses: { "200": { description: "Le portefeuille.", content: json(ref("Wallet"), { userId: "awa", currency: "XOF", available: 0, held: 0, tier: "complet", frozen: false }) }, ...walletErrors },
    }),
    get: op("Portefeuilles", "Lire un portefeuille", "Solde disponible, solde bloqué, palier et gel.", {
      operationId: "getWallet",
      security: api,
      parameters: [user],
      responses: { "200": { description: "Le portefeuille.", content: json(ref("Wallet")) }, ...walletErrors, "404": errRef("Portefeuille introuvable.") },
    }),
  },
  "/v1/wallets/{user}/movements": {
    get: op("Portefeuilles", "Lister les mouvements", "Écritures du registre qui touchent ce portefeuille.", {
      operationId: "listWalletMovements",
      security: api,
      parameters: [user, limit],
      responses: { "200": { description: "Mouvements.", content: json({ type: "object", properties: { data: { type: "array", items: ref("Movement") } }, required: ["data"] }) }, ...walletErrors },
    }),
  },
  "/v1/wallets/{user}/deposits": {
    post: op("Portefeuilles", "Alimenter un portefeuille", "Encaisse un paiement Mobile Money. Le portefeuille est crédité quand le paiement est confirmé : appelez `POST /v1/payments/{id}/refresh` ou attendez le cycle de 30 secondes.", {
      operationId: "depositToWallet",
      security: api,
      parameters: [user],
      requestBody: { required: true, content: json(ref("DepositRequest"), { amount: 20000, country: "BJ", phone: "+2290100000001", reference: "depot-1" }) },
      responses: { "201": { description: "Paiement de dépôt créé.", content: json(ref("Payment")) }, ...walletErrors },
    }),
  },
  "/v1/wallets/{user}/withdrawals": {
    post: op("Portefeuilles", "Retirer vers Mobile Money", "Workflow `wallet.withdraw` : vérifier les plafonds, bloquer les fonds, envoyer le retrait, puis débiter. En cas d'échec, les fonds bloqués sont libérés (compensation).", {
      operationId: "withdrawFromWallet",
      security: api,
      parameters: [user],
      requestBody: { required: true, content: json(ref("WithdrawalRequest"), { amount: 5000, country: "BJ", phone: "+2290100000001", operator: "mtn_bj", reference: "retrait-1" }) },
      responses: { "201": { description: "Retrait exécuté.", content: json(ref("WithdrawalResult"), { id: "wfr_93b8690f49654ceb9f594af721302033", status: "succeeded", payoutId: "po_f6be299eb1f44d63a8d4a588965ce39e", amount: 5000, fee: 0 }) }, ...walletErrors, "500": errRef("Retrait échoué après compensation (`withdrawal_failed`).") },
    }),
  },
  "/v1/wallets/transfers": {
    post: op("Portefeuilles", "Transférer entre deux portefeuilles", "Mouvement interne au registre, sans agrégateur. Les deux portefeuilles doivent avoir un palier. La `reference` sert d'idempotence.", {
      operationId: "transferBetweenWallets",
      security: api,
      requestBody: { required: true, content: json(ref("TransferRequest"), { from: "awa", to: "koffi", amount: 3000, reference: "transfert-1" }) },
      responses: { "201": { description: "Transfert effectué.", content: json(ref("TransferResult")) }, ...walletErrors },
    }),
  },

  "/admin/overview": {
    get: op("Administration", "Vue d'ensemble", "Chiffres du dashboard : paiements et retraits récents, volume réussi.", {
      operationId: "adminOverview", security: admin,
      responses: { "200": { description: "Vue d'ensemble.", content: json(ref("Overview")) }, ...authErrors },
    }),
  },
  "/admin/payments": {
    get: op("Administration", "Lister les paiements", "Paiements récents, le plus récent d'abord.", {
      operationId: "adminListPayments", security: admin, parameters: [limit],
      responses: { "200": { description: "Paiements.", content: json({ type: "object", properties: { data: { type: "array", items: ref("Payment") } }, required: ["data"] }) }, ...authErrors },
    }),
  },
  "/admin/payments/{id}": {
    get: op("Administration", "Détail d'un paiement", "Paiement, remboursements et chronologie.", {
      operationId: "adminGetPayment", security: admin, parameters: [idParam("id", "Identifiant Pont du paiement.")],
      responses: { "200": { description: "Détail.", content: json(ref("PaymentDetail")) }, ...errors([401, "Jeton absent ou invalide."], [404, "Paiement introuvable."]) },
    }),
  },
  "/admin/payments/{id}/refund": {
    post: op("Administration", "Rembourser depuis le dashboard", "Même règles que `POST /v1/payments/{id}/refunds`.", {
      operationId: "adminRefundPayment", security: admin, parameters: [idParam("id", "Identifiant Pont du paiement.")],
      requestBody: { required: false, content: json(ref("CreateRefundRequest")) },
      responses: { "201": { description: "Remboursement créé.", content: json(ref("Refund")) }, ...errors([400, "Paiement non remboursable."], [401, "Jeton absent ou invalide."], [404, "Paiement introuvable."], [422, "Aucun agrégateur disponible."]) },
    }),
  },
  "/admin/payouts": {
    get: op("Administration", "Lister les retraits", "Retraits récents.", {
      operationId: "adminListPayouts", security: admin, parameters: [limit],
      responses: { "200": { description: "Retraits.", content: json({ type: "object", properties: { data: { type: "array", items: ref("Payout") } }, required: ["data"] }) }, ...authErrors },
    }),
  },
  "/admin/coverage": {
    get: op("Administration", "Couverture par pays", "Quels agrégateurs encaissent, paient et remboursent dans quels pays.", {
      operationId: "adminCoverage", security: admin,
      responses: { "200": { description: "Couverture.", content: json({ type: "object", properties: { data: { type: "array", items: ref("CoverageCountry") } }, required: ["data"] }) }, ...authErrors },
    }),
  },
  "/admin/providers-health": {
    get: op("Administration", "Santé des agrégateurs", "Taux de réussite sur la dernière heure et paiements à réconcilier.", {
      operationId: "adminProvidersHealth", security: admin,
      responses: { "200": { description: "Santé.", content: json({ type: "object", properties: { data: { type: "array", items: ref("ProviderHealth") } }, required: ["data"] }) }, ...authErrors },
    }),
  },
  "/admin/test-payment": {
    post: op("Administration", "Lancer un paiement de test", "Sandbox uniquement. `scenario` : 7 chiffres du numéro magique (`0000001` succès par défaut, `0000002` solde insuffisant, `0000003` jamais confirmé, `0000004` webhook en double, `0000005` webhook tardif, `0000006` agrégateur en panne, `0000007` ambigu, `0000008` refusé).", {
      operationId: "adminTestPayment", security: admin,
      requestBody: { required: false, content: json({ type: "object", properties: { scenario: { type: "string", pattern: "^\\d{7}$", examples: ["0000002"] } } }) },
      responses: { "201": { description: "Paiement de test.", content: json(ref("Payment")) }, ...errors([401, "Jeton absent ou invalide."], [403, "Le sandbox n'est pas actif."]) },
    }),
  },
  "/admin/wallets": {
    get: op("Administration", "Lister les portefeuilles", "Portefeuilles existants.", {
      operationId: "adminListWallets", security: admin, parameters: [limit],
      responses: { "200": { description: "Portefeuilles.", content: json({ type: "object", properties: { data: { type: "array", items: ref("Wallet") } }, required: ["data"] }) }, ...errors([401, "Jeton absent ou invalide."], [501, "Pas de registre (mode Convex)."]) },
    }),
  },
  "/admin/wallets/{user}": {
    get: op("Administration", "Lire un portefeuille", "Détail d'un portefeuille.", {
      operationId: "adminGetWallet", security: admin, parameters: [user],
      responses: { "200": { description: "Portefeuille.", content: json(ref("Wallet")) }, ...errors([401, "Jeton absent ou invalide."], [404, "Portefeuille introuvable."], [501, "Pas de registre."]) },
    }),
  },
  "/admin/wallets/{user}/freeze": {
    post: op("Administration", "Geler ou dégeler un portefeuille", "Un portefeuille gelé ne peut plus rien sortir (`limit_exceeded` avec `limit: frozen`).", {
      operationId: "adminFreezeWallet", security: admin, parameters: [user],
      requestBody: { required: true, content: json({ type: "object", properties: { frozen: { type: "boolean" } }, required: ["frozen"] }, { frozen: true }) },
      responses: { "200": { description: "Portefeuille mis à jour.", content: json(ref("Wallet")) }, ...errors([400, "Requête invalide."], [401, "Jeton absent ou invalide."], [501, "Pas de registre."]) },
    }),
  },
  "/admin/ledger": {
    get: op("Administration", "Lire le registre", "Écritures en partie double et comptes système.", {
      operationId: "adminLedger", security: admin, parameters: [limit],
      responses: { "200": { description: "Registre.", content: json(ref("Ledger")) }, ...errors([401, "Jeton absent ou invalide."], [501, "Pas de registre."]) },
    }),
  },

  "/admin/providers": {
    get: op("Clés et agrégateurs", "Lister les agrégateurs", "État de configuration, champs (secrets masqués) et URL de webhook. Les agrégateurs personnalisés chargés depuis `PONT_PLUGINS_DIR` portent `custom: true`.", {
      operationId: "adminListProviders", security: admin,
      responses: { "200": { description: "Agrégateurs.", content: json(ref("ProvidersList")) }, ...authErrors },
    }),
  },
  "/admin/providers/{id}": {
    put: op("Clés et agrégateurs", "Enregistrer les clés d'un agrégateur", "Chiffre les clés dans le coffre (AES-256-GCM, `PONT_ENCRYPTION_KEY`). Pont valide la combinaison d'agrégateurs avant d'écrire.", {
      operationId: "adminPutProvider", security: admin, parameters: [idParam("id", "Identifiant de l'agrégateur.")],
      requestBody: { required: true, description: "Champs de l'agrégateur, voir `fields` dans `GET /admin/providers`.", content: json({ type: "object", additionalProperties: { type: "string" } }, { secretKey: "sk_sandbox_…" }) },
      responses: { "200": { description: "Agrégateur mis à jour.", content: json(ref("ProviderView")) }, ...errors([400, "Champ manquant ou inconnu."], [401, "Jeton absent ou invalide."], [409, "Coffre désactivé : définissez `PONT_ENCRYPTION_KEY` (`vault_disabled`)."], [422, "Combinaison d'agrégateurs refusée (`invalid_configuration`)."]) },
    }),
    delete: op("Clés et agrégateurs", "Supprimer les clés d'un agrégateur", "Retire les clés du coffre. Les clés des variables d'environnement ne sont pas touchées.", {
      operationId: "adminDeleteProvider", security: admin, parameters: [idParam("id", "Identifiant de l'agrégateur.")],
      responses: { "200": { description: "Clés supprimées.", content: json(ref("ProviderView")) }, ...errors([401, "Jeton absent ou invalide."], [409, "Coffre désactivé."]) },
    }),
  },

  "/admin/webhooks": {
    get: op("Webhooks sortants", "Lire les webhooks", "URL à déclarer chez les agrégateurs, destinataires de vos événements et dernières livraisons.", {
      operationId: "adminListWebhooks", security: admin,
      responses: { "200": { description: "Webhooks.", content: json(ref("WebhooksView")) }, ...authErrors },
    }),
  },
  "/admin/webhooks/endpoints": {
    post: op("Webhooks sortants", "Ajouter un destinataire", "Renvoie le secret de signature **une seule fois**. Vérifiez `Pont-Signature` : `t=<unix>,v1=<hmac_sha256(secret, t + \".\" + corps)>`, tolérance 300 s.", {
      operationId: "adminCreateEndpoint", security: admin,
      requestBody: { required: true, content: json({ type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] }, { url: "https://exemple.bj/webhooks/pont" }) },
      responses: { "201": { description: "Destinataire créé.", content: json(ref("EndpointCreated"), { id: "ep_758013f8ac09", url: "https://exemple.bj/webhooks/pont", secret: "whsec_…" }) }, ...errors([400, "URL invalide."], [401, "Jeton absent ou invalide."], [409, "Coffre désactivé."]) },
    }),
  },
  "/admin/webhooks/endpoints/{id}": {
    delete: op("Webhooks sortants", "Supprimer un destinataire", "Arrête les envois vers cette URL.", {
      operationId: "adminDeleteEndpoint", security: admin, parameters: [idParam("id", "Identifiant du destinataire (`ep_…`).")],
      responses: { "200": { description: "Supprimé.", content: json({ type: "object", properties: { deleted: { type: "boolean" } } }) }, ...errors([401, "Jeton absent ou invalide."], [404, "Destinataire introuvable."]) },
    }),
  },
  "/admin/webhooks/deliveries/{id}": {
    post: op("Webhooks sortants", "Renvoyer une livraison", "Relance immédiate d'une livraison échouée. Le calendrier automatique : 0 s, 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 1 j, 2 j, 3 j.", {
      operationId: "adminResendDelivery", security: admin, parameters: [idParam("id", "Identifiant de la livraison (`whd_…`).")],
      responses: { "200": { description: "Livraison relancée.", content: json(ref("Delivery")) }, ...errors([401, "Jeton absent ou invalide."], [404, "Livraison introuvable."]) },
    }),
  },

  "/admin/email": {
    get: op("E-mail et alertes", "Lire la configuration SMTP", "Le mot de passe n'est jamais renvoyé.", {
      operationId: "adminGetEmail", security: admin,
      responses: { "200": { description: "Configuration.", content: json(ref("EmailView")) }, ...authErrors },
    }),
    put: op("E-mail et alertes", "Enregistrer la configuration SMTP", "Le mot de passe est chiffré dans le coffre.", {
      operationId: "adminPutEmail", security: admin,
      requestBody: { required: true, content: json(ref("EmailConfigRequest"), { host: "smtp.exemple.bj", port: 587, security: "starttls", user: "contact@exemple.bj", from: "Pont <contact@exemple.bj>" }) },
      responses: { "200": { description: "Configuration enregistrée.", content: json(ref("EmailView")) }, ...errors([400, "Requête invalide."], [401, "Jeton absent ou invalide."], [409, "Coffre désactivé."]) },
    }),
    delete: op("E-mail et alertes", "Supprimer la configuration SMTP", "Désactive l'envoi d'e-mails.", {
      operationId: "adminDeleteEmail", security: admin,
      responses: { "200": { description: "Supprimée.", content: json(ref("EmailView")) }, ...authErrors },
    }),
  },
  "/admin/email/test": {
    post: op("E-mail et alertes", "Envoyer un e-mail de test", "Vérifie la configuration SMTP.", {
      operationId: "adminTestEmail", security: admin,
      requestBody: { required: true, content: json({ type: "object", properties: { to: { type: "string", format: "email" } }, required: ["to"] }, { to: "moi@exemple.bj" }) },
      responses: { "200": { description: "E-mail envoyé.", content: json({ type: "object", properties: { sent: { type: "boolean" } } }) }, ...errors([400, "Adresse invalide."], [401, "Jeton absent ou invalide."], [409, "SMTP non configuré (`smtp_not_configured`)."], [502, "Le serveur SMTP a refusé (`smtp_error`)."]) },
    }),
  },
  "/admin/email/send": {
    post: op("E-mail et alertes", "Envoyer un e-mail", "Envoi libre via le SMTP configuré.", {
      operationId: "adminSendEmail", security: admin,
      requestBody: { required: true, content: json({ type: "object", properties: { to: { type: "string", format: "email" }, subject: { type: "string" }, text: { type: "string" }, html: { type: "string" } }, required: ["to", "subject", "text"] }, { to: "moi@exemple.bj", subject: "Bonjour", text: "Message de test." }) },
      responses: { "200": { description: "E-mail envoyé.", content: json({ type: "object", properties: { sent: { type: "boolean" } } }) }, ...errors([400, "Requête invalide."], [401, "Jeton absent ou invalide."], [409, "SMTP non configuré."], [502, "Le serveur SMTP a refusé."]) },
    }),
  },
  "/admin/alerts": {
    get: op("E-mail et alertes", "Lire les alertes", "Règles, destinataires, seuil et historique des 50 dernières alertes.", {
      operationId: "adminGetAlerts", security: admin,
      responses: { "200": { description: "Alertes.", content: json(ref("AlertsView")) }, ...authErrors },
    }),
    put: op("E-mail et alertes", "Configurer les alertes", "Active des règles et choisit les destinataires. Exige un SMTP configuré.", {
      operationId: "adminPutAlerts", security: admin,
      requestBody: { required: true, content: json(ref("AlertsConfigRequest"), { rules: { payment_failed: true, admin_login: true }, recipients: ["moi@exemple.bj"], lowBalanceThreshold: 100000 }) },
      responses: { "200": { description: "Alertes configurées.", content: json(ref("AlertsView")) }, ...errors([400, "Requête invalide."], [401, "Jeton absent ou invalide."], [409, "SMTP non configuré (`alerts_not_ready`)."]) },
    }),
  },
  "/admin/alerts/test": {
    post: op("E-mail et alertes", "Envoyer une alerte de test", "Envoie une alerte aux destinataires configurés.", {
      operationId: "adminTestAlerts", security: admin,
      responses: { "200": { description: "Alerte envoyée.", content: json({ type: "object", properties: { sent: { type: "boolean" } } }) }, ...errors([401, "Jeton absent ou invalide."], [409, "Alertes non prêtes (`alerts_not_ready`)."], [502, "Envoi refusé."]) },
    }),
  },
  "/admin/alerts/events": {
    post: op("E-mail et alertes", "Signaler un événement", "Utilisé par le dashboard pour la règle `admin_login`.", {
      operationId: "adminAlertEvent", security: admin,
      requestBody: { required: true, content: json({ type: "object", properties: { rule: { type: "string", enum: ["admin_login"] }, detail: { type: "string" } }, required: ["rule"] }, { rule: "admin_login", detail: "Connexion de ancien@exemple.bj" }) },
      responses: { "200": { description: "Événement traité.", content: json({ type: "object" }) }, ...errors([400, "Requête invalide."], [401, "Jeton absent ou invalide."]) },
    }),
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "API Pont",
    version: "1.0.0",
    summary: "Orchestrateur de paiement BYOK pour l'Afrique francophone.",
    description:
      "Trois familles de routes : `/v1` (votre application, clé API), `/admin` (dashboard, jeton administrateur) et `/hooks` (agrégateurs, signature vérifiée).\n\n" +
      "**Montants** : entiers, en unités de la devise (XOF et XAF n'ont pas de décimales).\n\n" +
      "**Idempotence** : en-tête `Idempotency-Key`, sinon `auto:<type>:<reference>`. Une même clé avec un contenu différent renvoie `409 idempotency_conflict`.\n\n" +
      "**Erreurs** : toujours `{ \"error\": { \"code\", \"message\", \"fix\"? } }`.\n\n" +
      "**Ambigu** : quand l'état réel chez l'agrégateur est inconnu, le paiement garde son statut et porte `needsReconciliation: true`. Pont vérifie, sans jamais réessayer ailleurs.\n\n" +
      "**Sandbox** : les 7 derniers chiffres du numéro choisissent le scénario (`0000001` succès, `0000002` solde insuffisant, `0000003` jamais confirmé, `0000004` webhook en double, `0000005` webhook tardif, `0000006` agrégateur en panne, `0000007` ambigu, `0000008` refusé).",
  },
  servers: [{ url: "http://localhost:8787", description: "Self-host local" }],
  tags: [
    { name: "Santé", description: "Sonde de disponibilité." },
    { name: "Webhooks entrants", description: "Réception des webhooks des agrégateurs." },
    { name: "Paiements", description: "Encaisser un client et le rembourser." },
    { name: "Retraits", description: "Envoyer de l'argent vers Mobile Money." },
    { name: "Portefeuilles", description: "Soldes, dépôts, retraits et transferts (PostgreSQL uniquement)." },
    { name: "Administration", description: "Routes du dashboard." },
    { name: "Clés et agrégateurs", description: "Coffre de clés chiffrées." },
    { name: "Webhooks sortants", description: "Événements envoyés à votre application." },
    { name: "E-mail et alertes", description: "SMTP et alertes configurables." },
  ],
  components: {
    securitySchemes: {
      ApiKey: { type: "http", scheme: "bearer", description: "`PONT_API_KEY`, pour les routes `/v1`." },
      AdminToken: { type: "http", scheme: "bearer", description: "`PONT_ADMIN_TOKEN`, pour les routes `/admin`." },
    },
    schemas,
  },
  paths,
  webhooks: {
    pontEvent: {
      post: {
        tags: ["Webhooks sortants"],
        summary: "Événement Pont",
        description: "Envoyé à chacun de vos destinataires. En-têtes : `Pont-Signature` et `Pont-Event-Id`. Répondez `2xx` rapidement ; sinon Pont réessaie (0 s, 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 1 j, 2 j, 3 j).",
        requestBody: { content: json(ref("PontEvent")) },
        responses: { "200": { description: "Événement reçu." } },
      },
    },
  },
};

mkdirSync("public", { recursive: true });
writeFileSync("public/openapi.json", `${JSON.stringify(spec, null, 2)}\n`);
console.log(`openapi.json : ${Object.keys(paths).length} chemins`);
void sampleError;
