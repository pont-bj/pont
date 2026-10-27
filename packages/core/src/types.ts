// Contrat partagé par l'API, les SDK et les adaptateurs. Voir docs/CAHIER-DES-CHARGES.md §6-7 et docs/metier/.

export type Mode = "test" | "live";

export type ProviderId = "fedapay" | "paydunya" | "cinetpay" | "kkiapay" | "pawapay" | "sandbox";

export type Capability = "deposit" | "payout" | "refund" | "verify";

export type Currency = "XOF" | "XAF";

/** ISO 3166-1 alpha-2 des pays couverts au MVP. */
export type Country = "BJ" | "TG" | "CI" | "SN" | "BF" | "ML" | "NE" | "GN" | "CM" | "CG" | "CD" | "GA";

/** Identifiant d'opérateur interne à Pont, indépendant des codes agrégateurs. */
export type Operator =
  | "mtn_bj" | "moov_bj" | "celtiis_bj"
  | "moov_tg" | "tmoney_tg"
  | "mtn_ci" | "orange_ci" | "moov_ci" | "wave_ci"
  | "orange_sn" | "free_sn" | "wave_sn" | "expresso_sn" | "wizall_sn"
  | "orange_bf" | "moov_bf"
  | "orange_ml" | "moov_ml"
  | "mtn_cm" | "orange_cm"
  | "mtn_cg" | "airtel_cg"
  | "airtel_ga";

export type PaymentStatus =
  | "created"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

/** Montant en unités entières de la devise (XOF et XAF n'ont pas de décimales). R-002 */
export interface Money {
  amount: number;
  currency: Currency;
}

export interface Customer {
  /** Numéro au format E.164 (`+22901…`). */
  phone: string;
  name?: string;
  email?: string;
}

export interface CreatePaymentInput extends Money {
  country: Country;
  customer: Customer;
  method?: "mobile_money" | "card";
  operator?: Operator;
  /** Référence du marchand (commande, facture). */
  reference: string;
  description?: string;
  returnUrl?: string;
  metadata?: Record<string, string>;
  /** Code à usage unique généré par le client avant le paiement (Orange Burkina via PawaPay). */
  preAuthorisationCode?: string;
}

export type NextAction =
  /** Redirection vers une page hébergée (checkout agrégateur, Wave). */
  | { type: "redirect"; url: string }
  /** Le client doit valider la demande reçue sur son téléphone (push USSD). */
  | { type: "await_customer"; message: string }
  /** Le client doit d'abord obtenir un code (ex. Orange Burkina) et le fournir. */
  | { type: "preauth_code_required"; instructions: string }
  /** Le paiement se fait dans le widget front de l'agrégateur (Kkiapay). */
  | { type: "client_widget"; provider: ProviderId; publicKey: string; sandbox: boolean; amount: number; partnerId: string };

export interface Payment extends Money {
  id: string;
  mode: Mode;
  status: PaymentStatus;
  country: Country;
  provider: ProviderId;
  /** Identifiant unique de la tentative, envoyé à l'agrégateur quand il l'accepte (PawaPay, CinetPay). */
  attemptId: string;
  providerRef: string | null;
  operator: Operator | null;
  reference: string;
  nextAction: NextAction | null;
  failureCode: string | null;
  /** Vrai quand l'état réel chez l'agrégateur est inconnu et doit être réconcilié. */
  needsReconciliation: boolean;
  metadata: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

/** Contexte passé à l'adaptateur pour une création. */
export interface DepositRequest {
  input: CreatePaymentInput;
  attemptId: string;
  callbackUrl: string;
}

export interface DepositAccepted {
  providerRef: string | null;
  nextAction: NextAction;
}

export interface VerifiedState {
  status: PaymentStatus;
  /** Montant et devise réellement constatés chez l'agrégateur. R-013 */
  amount: number | null;
  currency: string | null;
  providerRef: string | null;
  failureCode: string | null;
  /** Identifiant de tentative renvoyé par l'agrégateur, quand il le conserve (lien anti-substitution). */
  attemptRef?: string | null;
}

/**
 * Résultat d'un appel agrégateur.
 * - `unavailable_before_push` : rien n'a été envoyé au client, un autre agrégateur peut être essayé. R-006
 * - `ambiguous` : la demande a pu partir ; interdit de réessayer ailleurs. R-005
 */
export type ProviderCallOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "rejected"; code: string; message: string }
  | { kind: "unavailable_before_push"; reason: string }
  | { kind: "ambiguous"; reason: string };

export type RecordKind = "payment" | "payout" | "refund";

export interface WebhookCheck {
  valid: boolean;
  /** Référence permettant de retrouver l'opération : providerRef ou attemptId selon l'agrégateur. */
  lookup: { kind?: RecordKind; by: "providerRef" | "attemptId"; value: string } | null;
}

/** Requête HTTP reçue, nécessaire aux signatures qui couvrent la méthode et l'URL (RFC 9421). */
export interface WebhookContext {
  method: string;
  url: string;
}

// ── Retraits et remboursements ────────────────────────────────────────────────

export type TransferStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled";

export interface CreatePayoutInput extends Money {
  country: Country;
  operator: Operator;
  recipient: { phone: string; name?: string; email?: string };
  reference: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface Payout extends Money {
  id: string;
  mode: Mode;
  status: TransferStatus;
  country: Country;
  operator: Operator;
  provider: ProviderId;
  attemptId: string;
  providerRef: string | null;
  recipientPhone: string;
  reference: string;
  failureCode: string | null;
  needsReconciliation: boolean;
  metadata: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface Refund extends Money {
  id: string;
  mode: Mode;
  paymentId: string;
  status: TransferStatus;
  provider: ProviderId;
  attemptId: string;
  providerRef: string | null;
  failureCode: string | null;
  needsReconciliation: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PayoutRequest {
  input: CreatePayoutInput;
  attemptId: string;
  callbackUrl: string;
}

export interface RefundRequest extends Money {
  payment: Pick<Payment, "attemptId" | "providerRef" | "amount" | "currency">;
  attemptId: string;
  /** Vrai si le montant couvre tout le paiement restant. */
  full: boolean;
}

export interface TransferAccepted {
  providerRef: string | null;
  /** Statut connu dès l'acceptation (certains agrégateurs répondent de façon synchrone). */
  status: TransferStatus;
}

export interface TransferVerified {
  status: TransferStatus;
  amount: number | null;
  currency: string | null;
  providerRef: string | null;
  failureCode: string | null;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly mode: Mode;
  supports(country: Country, operator: Operator | null, capability: Capability): boolean;
  createDeposit(request: DepositRequest): Promise<ProviderCallOutcome<DepositAccepted>>;
  /** Seule source de vérité pour passer un paiement à `succeeded`. R-001 */
  verify(payment: Pick<Payment, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<VerifiedState>>;
  /** Vérifie l'authenticité d'un webhook entrant. Ne décide jamais d'un statut. R-003 */
  checkWebhook(headers: Headers, rawBody: string, context?: WebhookContext): Promise<WebhookCheck>;
  createPayout?(request: PayoutRequest): Promise<ProviderCallOutcome<TransferAccepted>>;
  verifyPayout?(payout: Pick<Payout, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>>;
  createRefund?(request: RefundRequest): Promise<ProviderCallOutcome<TransferAccepted>>;
  verifyRefund?(refund: Pick<Refund, "attemptId" | "providerRef">): Promise<ProviderCallOutcome<TransferVerified>>;
}
