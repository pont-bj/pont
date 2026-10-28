import "server-only";
import { redirect } from "next/navigation";
import { env } from "./env";

export interface PaymentRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  country: string;
  provider: string;
  operator?: string | null;
  reference: string;
  needsReconciliation: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Overview {
  sandbox: boolean;
  mode: "test" | "live";
  features: { wallet: boolean };
  payments: { recent: PaymentRow[]; count: number; succeeded: number; volume: number };
  payouts: { recent: PaymentRow[]; count: number };
}

/** Erreur de l'API admin : conserve le statut HTTP et le message en français du serveur. */
export class PontApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { PONT_URL, PONT_ADMIN_TOKEN } = env();
  const response = await fetch(`${PONT_URL}/admin${path}`, {
    ...init,
    cache: "no-store",
    headers: { authorization: `Bearer ${PONT_ADMIN_TOKEN}`, "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === "object" && body !== null && "error" in body ? (body as { error?: { message?: unknown } }).error?.message : undefined;
    throw new PontApiError(response.status, typeof message === "string" ? message : `Le serveur Pont a répondu ${response.status}.`);
  }
  return (await response.json()) as T;
}

const fetchOverview = () => admin<Overview>("/overview");

/** Sans agrégateur configuré (503), les pages de données n'ont rien à montrer : on envoie vers la saisie des clés. */
export async function getOverview(): Promise<Overview> {
  try {
    return await fetchOverview();
  } catch (error) {
    if (error instanceof PontApiError && error.status === 503) redirect("/cles");
    throw error;
  }
}
export const listPayments = (limit = 100) => admin<{ data: PaymentRow[] }>(`/payments?limit=${limit}`).then((r) => r.data);
export const createTestPayment = (scenario?: string) => admin<PaymentRow>("/test-payment", { method: "POST", body: JSON.stringify(scenario ? { scenario } : {}) });

export interface WalletRow {
  userId: string;
  currency: string;
  available: number;
  held: number;
  tier: string | null;
  frozen: boolean;
}

export interface Movement {
  entryId: string;
  direction: "debit" | "credit";
  amount: number;
  createdAt: number;
}

export interface LedgerView {
  currency: string;
  system: { code: string; balance: number; currency: string }[];
  entries: { id: string; description: string; createdAt: number; reverses: string | null; lines: { account: string; direction: "debit" | "credit"; amount: number }[] }[];
}

export const listWallets = () => admin<{ data: WalletRow[] }>("/wallets?limit=200").then((r) => r.data);
export const getWallet = (userId: string) => admin<{ wallet: WalletRow; movements: Movement[] }>(`/wallets/${encodeURIComponent(userId)}`);
export const setFrozen = (userId: string, frozen: boolean) => admin<WalletRow>(`/wallets/${encodeURIComponent(userId)}/freeze`, { method: "POST", body: JSON.stringify({ frozen }) });
export const getLedger = () => admin<LedgerView>("/ledger?limit=50");

/** Aperçu pour la coque des pages : si aucun agrégateur n'est configuré (503), les pages Clés et Webhooks restent utilisables. */
export async function getShell(): Promise<Pick<Overview, "sandbox" | "mode" | "features">> {
  try {
    return await fetchOverview();
  } catch (error) {
    if (error instanceof PontApiError && error.status === 503) return { sandbox: false, mode: "test", features: { wallet: false } };
    throw error;
  }
}

export interface ProviderField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  set: boolean;
  /** Secret masqué (`••••1234`) ou valeur en clair pour un champ non secret. */
  value: string | null;
}

export interface ProviderView {
  id: string;
  label: string;
  source: "vault" | "env" | "none";
  configured: boolean;
  /** Agrégateur personnalisé chargé depuis le dossier de plugins (`pont provider new`). */
  custom?: boolean;
  webhookUrl: string;
  fields: ProviderField[];
}

/** Plugin dont le chargement a échoué : le serveur démarre quand même et le signale ici. */
export interface PluginError {
  dir: string;
  message: string;
}

export interface DeliveryView {
  id: string;
  endpointId: string;
  url: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  lastHttpStatus: number | null;
  eventType: string | null;
  createdAt: number;
  nextAttemptAt: number | null;
}

export interface WebhooksView {
  vault: boolean;
  inbound: { provider: string; url: string }[];
  endpoints: { id: string; url: string; source: "env" | "vault"; createdAt: number | null }[];
  deliveries: DeliveryView[];
}

export interface EmailView {
  vault: boolean;
  configured: boolean;
  host: string | null;
  port: number | null;
  security: "none" | "starttls" | "tls" | null;
  user: string | null;
  from: string | null;
  passwordSet: boolean;
}

export interface AlertRule {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface AlertHistoryEntry {
  id: string;
  rule: string;
  title: string;
  detail: string;
  at: number;
  status: "sent" | "failed";
  error?: string;
}

export interface AlertsView {
  vault: boolean;
  emailConfigured: boolean;
  rules: AlertRule[];
  recipients: string[];
  lowBalanceThreshold: number;
  history: AlertHistoryEntry[];
}

export const getEmail = () => admin<EmailView>("/email");
export const saveEmail = (values: Record<string, unknown>) => admin<EmailView>("/email", { method: "PUT", body: JSON.stringify(values) });
export const removeEmail = () => admin<unknown>("/email", { method: "DELETE" });
export const sendTestEmail = (to: string) => admin<unknown>("/email/test", { method: "POST", body: JSON.stringify({ to }) });
export const sendEmail = (to: string, subject: string, text: string) => admin<unknown>("/email/send", { method: "POST", body: JSON.stringify({ to, subject, text }) });
export const getAlerts = () => admin<AlertsView>("/alerts");
export const saveAlerts = (values: { rules: Record<string, boolean>; recipients: string[]; lowBalanceThreshold: number }) => admin<AlertsView>("/alerts", { method: "PUT", body: JSON.stringify(values) });
export const sendTestAlert = () => admin<unknown>("/alerts/test", { method: "POST" });

/** Le SMTP est-il configuré ? Faux si le serveur est injoignable ou le coffre désactivé : la réinitialisation par e-mail est alors proposée nulle part. */
export async function emailConfigured(): Promise<boolean> {
  try {
    return (await getEmail()).configured;
  } catch {
    return false;
  }
}

/** Prévient le serveur d'une connexion administrateur (alerte facultative). N'échoue jamais. */
export async function notifyAdminLogin(detail: string): Promise<void> {
  try {
    await admin<unknown>("/alerts/events", { method: "POST", body: JSON.stringify({ rule: "admin_login", detail }) });
  } catch {
    /* une alerte manquée ne doit pas bloquer la connexion */
  }
}

export const listProviders = () => admin<{ vault: boolean; data: ProviderView[]; pluginErrors?: PluginError[] }>("/providers");
export const saveProvider = (id: string, values: Record<string, string>) => admin<unknown>(`/providers/${id}`, { method: "PUT", body: JSON.stringify(values) });
export const removeProvider = (id: string) => admin<unknown>(`/providers/${id}`, { method: "DELETE" });
export const getWebhooks = () => admin<WebhooksView>("/webhooks");
export const addEndpoint = (url: string) => admin<{ id: string; url: string; secret: string }>("/webhooks/endpoints", { method: "POST", body: JSON.stringify({ url }) });
export const removeEndpoint = (id: string) => admin<unknown>(`/webhooks/endpoints/${encodeURIComponent(id)}`, { method: "DELETE" });
export const resendDelivery = (id: string) => admin<unknown>(`/webhooks/deliveries/${encodeURIComponent(id)}`, { method: "POST" });

export interface PayoutRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  country: string;
  operator: string;
  provider: string;
  reference: string;
  failureCode: string | null;
  needsReconciliation: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentFull extends PaymentRow {
  operator: string | null;
  providerRef: string | null;
  failureCode: string | null;
  mode: "test" | "live";
  metadata: Record<string, string>;
}

export interface TimelineStep {
  at: number;
  kind: "created" | "status" | "refund" | "webhook";
  title: string;
  detail: string;
  tone: "neutral" | "success" | "danger" | "info";
}

export interface RefundRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: number;
}

export interface CoverageRow {
  country: string;
  operators: string[];
  deposit: string[];
  payout: string[];
  refund: string[];
}

export interface ProviderHealth {
  provider: string;
  capabilities: string[];
  countries: number;
  lastHour: { settled: number; succeeded: number; rate: number } | null;
  needsReconciliation: number;
}

export const listPayouts = (limit = 100) => admin<{ data: PayoutRow[] }>(`/payouts?limit=${limit}`).then((r) => r.data);
export const getPaymentDetail = (id: string) => admin<{ payment: PaymentFull; refunds: RefundRow[]; timeline: TimelineStep[] }>(`/payments/${encodeURIComponent(id)}`);
export const refundPayment = (id: string, amount?: number) => admin<unknown>(`/payments/${encodeURIComponent(id)}/refund`, { method: "POST", body: JSON.stringify(amount ? { amount } : {}) });
export const getCoverage = () => admin<{ data: CoverageRow[] }>("/coverage").then((r) => r.data);
export const getProvidersHealth = () => admin<{ data: ProviderHealth[] }>("/providers-health").then((r) => r.data);
