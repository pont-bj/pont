import { PontError, type FetchLike } from "@pont/core";
import { WebhookRelay, type PontEngine } from "@pont/engine";
import { createPontFromEnv, parseEnv } from "@pont/node";
import { authorized, createApp, errorResponse } from "./app.js";
import { createAlerts } from "./alerts.js";
import { createEmail, smtpTransport, type TransportFactory } from "./email.js";
import { createControl, isControlPath } from "./control.js";
import { loadPlugins } from "./plugins.js";
import { hasAnyProvider, overlayEnv } from "./providers.js";
import { ProviderRegistry } from "./registry.js";
import { Vault } from "./vault.js";
import { parseServerEnv } from "./config.js";
import { BUILT_IN_STORAGE, type StorageFactory } from "./storage.js";
import { createWalletKit, reconcileWallet, type WalletKit } from "./wallet.js";

export interface Runtime {
  handle: (request: Request) => Promise<Response>;
  /** Réconciliation et livraison des webhooks dus. */
  tick: () => Promise<void>;
  engine: PontEngine;
  port: number;
  tickSeconds: number;
  /** Ferme les connexions du stockage. */
  close: () => Promise<void>;
}

export interface RuntimeOptions {
  /** Stockage personnalisé : remplace celui choisi par `PONT_STORE`. */
  storage?: StorageFactory;
  /** Transport SMTP (tests : `jsonTransport`). Par défaut nodemailer. */
  transport?: TransportFactory;
  /** Remplace `fetch` dans les adaptateurs personnalisés (tests avec un faux agrégateur). */
  pluginFetch?: FetchLike;
}

/** Assemble moteur, stockage, relais et API à partir des variables d'environnement. */
export async function createRuntime(source: Record<string, string | undefined> = process.env, options: RuntimeOptions = {}): Promise<Runtime> {
  const config = parseServerEnv(source);
  // Le serveur reçoit les webhooks des agrégateurs sur /hooks/<agrégateur>.
  const env = { PONT_HOOKS_PATH: "/hooks", ...source };
  const pontEnv = parseEnv(env);

  const storage = await (options.storage ?? BUILT_IN_STORAGE[config.PONT_STORE])(config);
  if (pontEnv.PONT_MODE === "live" && !storage.durable) {
    await storage.close?.();
    throw new PontError("configuration_error", "En live, un stockage durable est obligatoire (PONT_STORE=convex ou postgres) : la mémoire perd les paiements au redémarrage.");
  }

  const loaded = await loadPlugins(config.PONT_PLUGINS_DIR);
  const registry = new ProviderRegistry(loaded.plugins, loaded.errors, options.pluginFetch);
  const vault = config.PONT_ENCRYPTION_KEY && storage.secrets ? new Vault(storage.secrets, config.PONT_ENCRYPTION_KEY) : null;
  const email = vault ? createEmail(vault, options.transport ?? smtpTransport) : null;
  const alerts = vault && email ? createAlerts(vault, email) : null;
  const envEndpoint = config.PONT_WEBHOOK_URL ? { id: "app", url: config.PONT_WEBHOOK_URL, secret: config.PONT_WEBHOOK_SECRET! } : null;
  const relay = new WebhookRelay({ mode: pontEnv.PONT_MODE, endpoints: envEndpoint ? [envEndpoint] : [], store: storage.deliveries });

  interface Live {
    engine: PontEngine;
    wallet: WalletKit | null;
    handle: (request: Request) => Promise<Response>;
  }

  /** Assemble moteur, portefeuille et API avec les identifiants courants (variables d'environnement + coffre). */
  async function assemble(): Promise<Live | null> {
    const merged = await overlayEnv(env, vault);
    // Sans aucun agrégateur (coffre encore vide), le serveur démarre quand même pour que le dashboard puisse en saisir un.
    // En sandbox, seul le simulateur est actif : ni coffre ni plugins.
    const extraAdapters = merged.PONT_SANDBOX === "true" ? [] : await registry.adapters(env, vault, pontEnv.PONT_MODE);
    if (vault && merged.PONT_SANDBOX !== "true" && !hasAnyProvider(merged) && extraAdapters.length === 0) return null;
    // Le service de portefeuille a besoin du moteur, qui a besoin de lui pour ses événements : liaison tardive.
    let wallet: WalletKit | null = null;
    const engine = createPontFromEnv({
      env: merged,
      stores: storage,
      extraAdapters,
      onEvent: async (event) => {
        await relay.enqueue(event);
        // Si le crédit échoue, `tick` le rejoue (reconcileWallet) : écritures idempotentes, jamais de double crédit.
        if (wallet) await wallet.service.handleEvent(event);
      },
    });
    wallet = createWalletKit(storage, config, engine);
    return {
      engine,
      wallet,
      handle: createApp({ engine, stores: storage, wallet, apiKey: config.PONT_API_KEY, adminToken: config.PONT_ADMIN_TOKEN, sandbox: pontEnv.PONT_SANDBOX === "true" }),
    };
  }

  let live = await assemble();
  if (!live) {
    if (!vault) {
      await storage.close?.();
      throw new PontError("configuration_error", "Aucun agrégateur configuré.", "Renseignez les clés d'un agrégateur, ou PONT_SANDBOX=true pour tester sans compte.");
    }
  }

  const control = createControl({
    registry,
    mode: pontEnv.PONT_MODE,
    source: env,
    vault,
    relay,
    envEndpoint,
    email,
    alerts,
    listDeliveries: (limit) => storage.deliveries.listRecent(limit),
    publicUrl: pontEnv.PONT_PUBLIC_URL,
    hooksPath: pontEnv.PONT_HOOKS_PATH,
    reload: async () => {
      live = await assemble();
    },
  });
  await control.syncEndpoints();

  const noProvider = () =>
    Response.json({ error: { code: "no_provider_available", message: "Aucun agrégateur configuré.", fix: "Ajoutez vos clés dans le dashboard (page Clés)." } }, { status: 503 });

  return {
    handle: async (request) => {
      const path = new URL(request.url).pathname.split("/").filter(Boolean);
      if (path[0] === "admin" && isControlPath(path.slice(1))) {
        if (!authorized(request, config.PONT_ADMIN_TOKEN)) return Response.json({ error: { code: "unauthorized", message: "Authentification requise." } }, { status: 401 });
        try {
          return await control.handle(request, path.slice(1));
        } catch (error) {
          return errorResponse(error);
        }
      }
      if (path[0] === "health") return Response.json({ status: "ok" });
      return live ? live.handle(request) : noProvider();
    },
    tick: async () => {
      if (live) {
        await live.engine.reconcile();
        if (live.wallet) await reconcileWallet(live.wallet, storage);
      }
      await relay.processDue();
      // Une alerte qui ne part pas ne doit jamais bloquer la réconciliation.
      await alerts?.evaluate({ payments: storage.payments, payouts: storage.payouts, deliveries: storage.deliveries, wallet: live?.wallet ?? null }).catch(() => undefined);
    },
    get engine() {
      if (!live) throw new PontError("no_provider_available", "Aucun agrégateur configuré.");
      return live.engine;
    },
    port: config.PORT,
    tickSeconds: config.PONT_TICK_SECONDS,
    close: async () => storage.close?.(),
  };
}
