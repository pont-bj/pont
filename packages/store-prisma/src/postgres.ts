import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { createPrismaStores, type PontPrismaClient } from "./index.js";
import { PrismaCustomerProfileStore, PrismaLedgerStore, type PontPrismaLedgerClient, type PontPrismaProfileClient } from "./ledger.js";

/**
 * Connexion à une base PostgreSQL (la vôtre : Neon, Supabase, RDS, serveur local…) et stores prêts à l'emploi.
 * Les tables se créent avec `prisma db push` (voir README).
 */
export function connectPostgres(connectionString: string) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const client = prisma as unknown as PontPrismaClient;
  return {
    client,
    stores: createPrismaStores(client),
    ledger: new PrismaLedgerStore(prisma as unknown as PontPrismaLedgerClient),
    profiles: new PrismaCustomerProfileStore(prisma as unknown as PontPrismaProfileClient),
    disconnect: () => prisma.$disconnect(),
  };
}
