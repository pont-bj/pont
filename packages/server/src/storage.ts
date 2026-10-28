import { ConvexHttpClient } from "convex/browser";
import {
  MemoryDeliveryStore,
  MemoryIdempotencyStore,
  MemoryPaymentStore,
  MemoryPayoutStore,
  MemoryRefundStore,
  MemorySecretStore,
  type DeliveryStore,
  type IdempotencyStore,
  type PaymentStore,
  type PayoutStore,
  type RefundStore,
  type SecretStore,
} from "@pont/engine";
import { MemoryLedgerStore, MemoryCustomerProfileStore, type LedgerStore, type ManagedProfileStore } from "@pont/ledger";
import { MemoryWorkflowRunStore, type WorkflowRunStore } from "@pont/framework";
import { createConvexStores, type ConvexRunner } from "@pont/store-convex";
import type { ServerEnv } from "./config.js";

/**
 * Adaptateur de stockage : tout ce que le serveur persiste. Pour brancher une autre base (MySQL, MongoDB,
 * DynamoDB…), implémentez les cinq interfaces du moteur et passez l'adaptateur à `createRuntime`.
 */
export interface StorageAdapter {
  payments: PaymentStore;
  payouts: PayoutStore;
  refunds: RefundStore;
  idempotency: IdempotencyStore;
  deliveries: DeliveryStore;
  /** Coffre de secrets (valeurs chiffrées). Absent : clés d'agrégateurs et destinataires de webhooks par variables d'environnement seulement. */
  secrets?: SecretStore;
  /** Registre, portefeuilles et profils clients. Absent : le portefeuille n'est pas disponible avec ce stockage. */
  ledger?: { store: LedgerStore; profiles: ManagedProfileStore };
  /** Reprise des retraits interrompus (workflow `wallet.withdraw`). Mémoire si absent. */
  workflowRuns?: WorkflowRunStore;
  /** Les données survivent à un redémarrage. Obligatoire en mode live. */
  durable: boolean;
  /** Ferme les connexions à l'arrêt du serveur. */
  close?: () => Promise<void>;
}

export type StorageFactory = (env: ServerEnv) => StorageAdapter | Promise<StorageAdapter>;

export const memoryStorage: StorageFactory = () => ({
  payments: new MemoryPaymentStore(),
  payouts: new MemoryPayoutStore(),
  refunds: new MemoryRefundStore(),
  idempotency: new MemoryIdempotencyStore(),
  deliveries: new MemoryDeliveryStore(),
  secrets: new MemorySecretStore(),
  ledger: { store: new MemoryLedgerStore(), profiles: new MemoryCustomerProfileStore() },
  workflowRuns: new MemoryWorkflowRunStore(),
  durable: false,
});

export const convexStorage: StorageFactory = (env) => ({
  ...createConvexStores({ client: new ConvexHttpClient(env.CONVEX_URL!) as unknown as ConvexRunner, secret: env.PONT_STORE_SECRET! }),
  durable: true,
});

/** Chargé à la demande : le client Prisma n'est généré et importé que si PostgreSQL est choisi. */
export const postgresStorage: StorageFactory = async (env) => {
  const { connectPostgres } = await import("@pont/store-prisma/postgres");
  const { stores, ledger, profiles, disconnect } = connectPostgres(env.DATABASE_URL!);
  const { workflowRuns, ...records } = stores;
  return { ...records, workflowRuns, ledger: { store: ledger, profiles }, durable: true, close: disconnect };
};

export const BUILT_IN_STORAGE: Record<ServerEnv["PONT_STORE"], StorageFactory> = {
  memory: memoryStorage,
  convex: convexStorage,
  postgres: postgresStorage,
};
