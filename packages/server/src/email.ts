import nodemailer from "nodemailer";
import { z } from "zod";
import { PontError } from "@pont-bj/core";
import type { Vault } from "./vault.js";

const STORAGE_KEY = "email:smtp";

export const smtpSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  /** `none` : sans chiffrement (réseau local, Mailpit) ; `starttls` : port 587 ; `tls` : port 465. */
  security: z.enum(["none", "starttls", "tls"]),
  user: z.string().max(255).optional(),
  password: z.string().max(1000).optional(),
  /** Adresse d'expédition : `contact@exemple.bj` ou `Pont <contact@exemple.bj>`. */
  from: z.string().min(3).max(255),
});

export type SmtpConfig = z.infer<typeof smtpSchema>;

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/** Ce que le serveur utilise d'un transport nodemailer : remplaçable dans les tests. */
export interface MailTransport {
  sendMail(mail: Mail & { from: string }): Promise<unknown>;
  verify?(): Promise<unknown>;
}

export type TransportFactory = (config: SmtpConfig) => MailTransport;

export const smtpTransport: TransportFactory = (config) =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "tls",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? "" } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

export interface EmailView {
  configured: boolean;
  host: string | null;
  port: number | null;
  security: SmtpConfig["security"] | null;
  user: string | null;
  from: string | null;
  /** Le mot de passe n'est jamais renvoyé : seulement s'il existe. */
  passwordSet: boolean;
}

export type EmailService = ReturnType<typeof createEmail>;

/** Configuration SMTP chiffrée dans le coffre et envoi d'e-mails (réinitialisation de mot de passe, alertes). */
export function createEmail(vault: Vault, factory: TransportFactory = smtpTransport) {
  async function load(): Promise<SmtpConfig | null> {
    const raw = await vault.getJson(STORAGE_KEY);
    return raw === null ? null : smtpSchema.parse(raw);
  }

  return {
    load,

    async view(): Promise<EmailView> {
      const config = await load();
      return {
        configured: config !== null,
        host: config?.host ?? null,
        port: config?.port ?? null,
        security: config?.security ?? null,
        user: config?.user ?? null,
        from: config?.from ?? null,
        passwordSet: Boolean(config?.password),
      };
    },

    /** Fusionne : un mot de passe omis ou vide garde l'ancien (le dashboard ne le relit jamais). */
    async save(input: unknown): Promise<void> {
      const previous = await load();
      const body = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const merged = { ...body, ...(body.password ? {} : { password: previous?.password }) };
      const parsed = smtpSchema.safeParse(merged);
      if (!parsed.success) {
        throw new PontError("invalid_request", parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "));
      }
      await vault.putJson(STORAGE_KEY, parsed.data);
    },

    remove: () => vault.delete(STORAGE_KEY),

    /** Envoie un e-mail. `null` si le SMTP n'est pas configuré ; lève une erreur lisible si l'envoi échoue. */
    async send(mail: Mail): Promise<boolean> {
      const config = await load();
      if (!config) return false;
      const transport = factory(config);
      try {
        await transport.sendMail({ ...mail, from: config.from });
      } catch (error) {
        throw new SmtpError(error);
      }
      return true;
    },
  };
}

/** Échec d'envoi : message court, sans détail pouvant contenir des identifiants. */
export class SmtpError extends Error {
  constructor(cause: unknown) {
    const text = cause instanceof Error ? cause.message : String(cause);
    super(text.replace(/\s+/g, " ").slice(0, 200));
  }
}
