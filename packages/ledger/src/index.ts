import { defineModule } from "@pont/framework";
import { Ledger, MemoryLedgerStore, type LedgerStore } from "./ledger.js";
import { Limits, MemoryCustomerProfileStore, type CustomerProfileStore } from "./limits.js";
import { Wallets } from "./wallets.js";

export * from "./ledger.js";
export * from "./wallets.js";
export * from "./limits.js";

/** Module `ledger` : registre en partie double. Config : `{ store?: LedgerStore }` (mémoire par défaut). */
export const ledgerModule = defineModule({
  name: "ledger",
  version: "0.1.0",
  license: "proprietary",
  description: "Registre en partie double : écritures équilibrées, immuables, idempotentes, sans découvert.",
  create: (ctx) => new Ledger((ctx.config.store as LedgerStore | undefined) ?? new MemoryLedgerStore()),
});

/** Module `wallets` : portefeuilles utilisateurs (disponible / bloqué), dépôts, retraits, transferts. */
export const walletsModule = defineModule({
  name: "wallets",
  version: "0.1.0",
  license: "proprietary",
  description: "Portefeuilles utilisateurs : dépôts, blocage, retraits, transferts internes, frais.",
  dependsOn: ["ledger"],
  create: (ctx) => new Wallets(ctx.get<Ledger>("ledger")),
});

/** Module `limits` : plafonds par palier KYC et gel. Config : `{ tiers, profiles? }`. */
export const limitsModule = defineModule({
  name: "limits",
  version: "0.1.0",
  license: "proprietary",
  description: "Plafonds par palier KYC (solde, unitaire, 24 h, 30 jours) et gel de compte.",
  dependsOn: ["wallets"],
  create: (ctx) =>
    new Limits(
      { tiers: ctx.config.tiers },
      ctx.get<Wallets>("wallets"),
      (ctx.config.profiles as CustomerProfileStore | undefined) ?? new MemoryCustomerProfileStore(),
    ),
});
