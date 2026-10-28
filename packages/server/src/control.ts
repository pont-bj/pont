import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { PontError, isPontError, type Mode } from "@pont-bj/core";
import type { Delivery, WebhookEndpoint, WebhookRelay } from "@pont-bj/engine";
import { AlertConfigError, RULES, RULE_IDS, type AlertService, type RuleId } from "./alerts.js";
import { SmtpError, type EmailService } from "./email.js";
import type { ProviderRegistry } from "./registry.js";
import type { Vault } from "./vault.js";

export interface ControlOptions {
  registry: ProviderRegistry;
  mode: Mode;
  source: Record<string, string | undefined>;
  vault: Vault | null;
  relay: WebhookRelay;
  /** Destinataire défini par variables d'environnement (PONT_WEBHOOK_URL), non modifiable depuis le dashboard. */
  envEndpoint: WebhookEndpoint | null;
  listDeliveries: (limit: number) => Promise<Delivery[]>;
  publicUrl: string;
  hooksPath: string;
  email: EmailService | null;
  alerts: AlertService | null;
  /** Reconstruit le moteur avec les nouveaux identifiants. */
  reload: () => Promise<void>;
}

interface StoredEndpoint extends WebhookEndpoint {
  createdAt: number;
}

const endpointInput = z.object({ url: z.string().url().max(2000) });
const ENDPOINT_PREFIX = "endpoint:";

const vaultDisabled = () =>
  Response.json(
    { error: { code: "vault_disabled", message: "Le coffre est désactivé : définissez PONT_ENCRYPTION_KEY (openssl rand -hex 32) pour gérer les clés depuis le dashboard." } },
    { status: 409 },
  );
const notFound = () => Response.json({ error: { code: "not_found", message: "Route introuvable." } }, { status: 404 });

export function isControlPath(path: string[]): boolean {
  return path[0] === "providers" || path[0] === "webhooks" || path[0] === "email" || path[0] === "alerts";
}

export function createControl(options: ControlOptions) {
  const { vault, relay } = options;

  async function storedEndpoints(): Promise<StoredEndpoint[]> {
    if (!vault) return [];
    const keys = await vault.list(ENDPOINT_PREFIX);
    const rows = await Promise.all(keys.map(({ key }) => vault.getJson(key)));
    return rows.filter((row): row is StoredEndpoint => row !== null) as StoredEndpoint[];
  }

  /** Recharge les destinataires du relais : variables d'environnement + coffre. */
  async function syncEndpoints(): Promise<void> {
    relay.setEndpoints([...(options.envEndpoint ? [options.envEndpoint] : []), ...(await storedEndpoints())]);
  }

  function eventType(body: string): string | null {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null && "type" in parsed && typeof parsed.type === "string") return parsed.type;
    } catch {
      /* corps non JSON : type inconnu */
    }
    return null;
  }

  const bodyOf = async (request: Request): Promise<Record<string, unknown>> => {
    const body: unknown = await request.json().catch(() => undefined);
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  };

  const smtpFailure = (error: unknown) =>
    Response.json({ error: { code: "smtp_error", message: `Envoi impossible : ${error instanceof SmtpError ? error.message : "erreur SMTP."}` } }, { status: 502 });

  async function emailRoutes(request: Request, sub: string | undefined): Promise<Response> {
    const { email } = options;
    if (!email) return vaultDisabled();
    if (sub === undefined && request.method === "GET") return Response.json({ vault: true, ...(await email.view()) });
    if (sub === undefined && request.method === "PUT") {
      await email.save(await bodyOf(request));
      return Response.json(await email.view());
    }
    if (sub === undefined && request.method === "DELETE") {
      await email.remove();
      return Response.json({ deleted: true });
    }
    if ((sub === "test" || sub === "send") && request.method === "POST") {
      const body = await bodyOf(request);
      const to = body.to;
      const target = typeof to === "string" ? to : "";
      if (!z.string().email().safeParse(target).success) throw new PontError("invalid_request", "Adresse du destinataire invalide.");
      const mail =
        sub === "test"
          ? { to: target, subject: "Pont : e-mail de test", text: "Votre configuration SMTP fonctionne. Les e-mails de Pont (mot de passe oublié, alertes) partiront de cette adresse." }
          : { to: target, subject: String(body.subject ?? "").slice(0, 200), text: String(body.text ?? "").slice(0, 20_000), ...(typeof body.html === "string" ? { html: body.html.slice(0, 50_000) } : {}) };
      if (sub === "send" && (!mail.subject || !mail.text)) throw new PontError("invalid_request", "Objet et texte requis.");
      try {
        if (!(await email.send(mail))) {
          return Response.json({ error: { code: "smtp_not_configured", message: "Le SMTP n'est pas configuré." } }, { status: 409 });
        }
      } catch (error) {
        return smtpFailure(error);
      }
      return Response.json({ sent: true });
    }
    return notFound();
  }

  async function alertRoutes(request: Request, sub: string | undefined): Promise<Response> {
    const { alerts, email } = options;
    if (!alerts || !email) return vaultDisabled();
    if (sub === undefined && (request.method === "GET" || request.method === "PUT")) {
      try {
        const config = request.method === "PUT" ? await alerts.saveConfig(await bodyOf(request)) : await alerts.config();
        return Response.json({
          vault: true,
          emailConfigured: (await email.view()).configured,
          rules: RULE_IDS.map((id) => ({ id, ...RULES[id], enabled: config.rules[id] })),
          recipients: config.recipients,
          lowBalanceThreshold: config.lowBalanceThreshold,
          history: await alerts.history(50),
        });
      } catch (error) {
        if (error instanceof AlertConfigError) return Response.json({ error: { code: "invalid_request", message: error.message } }, { status: 400 });
        throw error;
      }
    }
    if (sub === "test" && request.method === "POST") {
      const sent = await alerts.sendTest();
      return sent ? Response.json({ sent: true }) : Response.json({ error: { code: "alerts_not_ready", message: "Configurez le SMTP et au moins un destinataire." } }, { status: 409 });
    }
    // Évènements émis par le dashboard (connexion administrateur).
    if (sub === "events" && request.method === "POST") {
      const body = await bodyOf(request);
      if (body.rule !== "admin_login") throw new PontError("invalid_request", "Évènement inconnu.");
      const detail = String(body.detail ?? "").slice(0, 500);
      return Response.json({ sent: await alerts.notify(body.rule as RuleId, "Connexion administrateur", detail) });
    }
    return notFound();
  }

  async function handle(request: Request, path: string[]): Promise<Response> {
    const [resource, id, action] = path;
    if (resource === "email") return emailRoutes(request, id);
    if (resource === "alerts") return alertRoutes(request, id);
    if (resource === "providers") {
      if (request.method === "GET" && id === undefined) {
        return Response.json({ vault: Boolean(vault), ...(await options.registry.list(options.source, vault, options.publicUrl, options.hooksPath)) });
      }
      if (id === undefined || !options.registry.has(id)) return notFound();
      if (!vault) return vaultDisabled();
      if (request.method === "PUT") {
        try {
          await options.registry.save(id, await request.json().catch(() => undefined), options.source, vault, options.mode);
        } catch (error) {
          // Combinaison refusée (champ manquant, Kkiapay avec un autre agrégateur…) : message clair, rien n'est écrit.
          if (isPontError(error) && error.code === "configuration_error") {
            return Response.json({ error: { code: "invalid_configuration", message: error.messageFr, ...(error.fix ? { fix: error.fix } : {}) } }, { status: 422 });
          }
          throw error;
        }
        await options.reload();
        return Response.json({ data: (await options.registry.list(options.source, vault, options.publicUrl, options.hooksPath)).data.find((p) => p.id === id) });
      }
      if (request.method === "DELETE") {
        await options.registry.remove(id, vault);
        await options.reload();
        return Response.json({ deleted: true });
      }
    }

    if (resource === "webhooks") {
      const base = options.publicUrl.replace(/\/$/, "");
      if (request.method === "GET" && id === undefined) {
        const deliveries = await options.listDeliveries(50);
        return Response.json({
          vault: Boolean(vault),
          inbound: ["fedapay", "pawapay", "paydunya", "kkiapay"].map((provider) => ({ provider, url: `${base}${options.hooksPath}/${provider}` })),
          endpoints: [
            ...(options.envEndpoint ? [{ id: options.envEndpoint.id, url: options.envEndpoint.url, source: "env" as const, createdAt: null }] : []),
            ...(await storedEndpoints()).map((e) => ({ id: e.id, url: e.url, source: "vault" as const, createdAt: e.createdAt })),
          ],
          deliveries: deliveries.map((d) => ({
            id: d.id,
            endpointId: d.endpointId,
            url: d.url,
            status: d.status,
            attempts: d.attempts.length,
            lastError: d.attempts.at(-1)?.error ?? null,
            lastHttpStatus: d.attempts.at(-1)?.httpStatus ?? null,
            eventType: eventType(d.body),
            createdAt: d.createdAt,
            nextAttemptAt: d.nextAttemptAt,
          })),
        });
      }
      if (request.method === "POST" && id === "endpoints") {
        if (!vault) return vaultDisabled();
        const parsed = endpointInput.safeParse(await request.json().catch(() => undefined));
        if (!parsed.success) throw new PontError("invalid_request", "Une URL valide est attendue.");
        const endpoint: StoredEndpoint = { id: `ep_${randomUUID().replace(/-/g, "").slice(0, 12)}`, url: parsed.data.url, secret: `whsec_${randomBytes(24).toString("hex")}`, createdAt: Date.now() };
        // Valide l'URL (adresses internes refusées) avant d'écrire quoi que ce soit.
        relay.setEndpoints([...(options.envEndpoint ? [options.envEndpoint] : []), ...(await storedEndpoints()), endpoint]);
        await vault.putJson(`${ENDPOINT_PREFIX}${endpoint.id}`, endpoint);
        // Le secret n'est montré qu'ici : il sert à vérifier la signature côté application.
        return Response.json({ id: endpoint.id, url: endpoint.url, secret: endpoint.secret }, { status: 201 });
      }
      if (request.method === "DELETE" && id === "endpoints" && action) {
        if (!vault) return vaultDisabled();
        await vault.delete(`${ENDPOINT_PREFIX}${action}`);
        await syncEndpoints();
        return Response.json({ deleted: true });
      }
      if (request.method === "POST" && id === "deliveries" && action) {
        const delivery = await relay.resend(action);
        return Response.json({ id: delivery.id, status: delivery.status, attempts: delivery.attempts.length });
      }
    }
    return notFound();
  }

  return { handle, syncEndpoints };
}

export type Control = ReturnType<typeof createControl>;
