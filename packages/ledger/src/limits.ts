import { z } from "zod";
import { PontError, type Currency } from "@pont-bj/core";
import type { Wallets } from "./wallets.js";

// Plafonds par palier KYC et gel de compte (R-035). Les montants exacts relèvent de la fintech et de son
// agrément (paliers BCEAO applicables) : Pont fournit le mécanisme, pas les valeurs réglementaires.

export const tierSchema = z
  .object({
    maxBalance: z.number().int().positive(),
    maxSingle: z.number().int().positive(),
    maxDailyOut: z.number().int().positive(),
    maxMonthlyOut: z.number().int().positive(),
  })
  .strict();

export const limitsConfigSchema = z.object({ tiers: z.record(z.string().min(1), tierSchema).refine((t) => Object.keys(t).length > 0, "Au moins un palier.") });

export type LimitsConfig = z.infer<typeof limitsConfigSchema>;

export type Operation = "deposit" | "withdraw" | "transfer_out" | "transfer_in";

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; code: "frozen" | "max_single" | "max_balance" | "max_daily_out" | "max_monthly_out" | "unknown_tier"; message: string };

/** Palier et gel de chaque utilisateur. Le module `customers` fournira une implémentation persistante. */
export interface CustomerProfileStore {
  getTier(userId: string): Promise<string | null>;
  isFrozen(userId: string): Promise<boolean>;
}

/** Profil modifiable : palier KYC et gel, gérés par la fintech (API ou dashboard). */
export interface ManagedProfileStore extends CustomerProfileStore {
  setTier(userId: string, tier: string): Promise<void>;
  setFrozen(userId: string, frozen: boolean): Promise<void>;
}

export class MemoryCustomerProfileStore implements ManagedProfileStore {
  private readonly tiers = new Map<string, string>();
  private readonly frozen = new Set<string>();

  async setTier(userId: string, tier: string): Promise<void> {
    this.tiers.set(userId, tier);
  }

  async setFrozen(userId: string, frozen: boolean): Promise<void> {
    if (frozen) this.frozen.add(userId);
    else this.frozen.delete(userId);
  }

  freeze(userId: string): void {
    this.frozen.add(userId);
  }

  unfreeze(userId: string): void {
    this.frozen.delete(userId);
  }

  async getTier(userId: string): Promise<string | null> {
    return this.tiers.get(userId) ?? null;
  }

  async isFrozen(userId: string): Promise<boolean> {
    return this.frozen.has(userId);
  }
}

const DAY = 24 * 60 * 60 * 1000;

const OUTGOING: ReadonlySet<Operation> = new Set(["withdraw", "transfer_out"]);
const INCOMING: ReadonlySet<Operation> = new Set(["deposit", "transfer_in"]);

function fmt(amount: number, currency: Currency): string {
  return `${amount.toLocaleString("fr-FR").replace(/ /g, " ")} ${currency}`;
}

export class Limits {
  private readonly config: LimitsConfig;

  constructor(
    config: unknown,
    private readonly wallets: Wallets,
    private readonly profiles: CustomerProfileStore,
    private readonly now: () => number = Date.now,
  ) {
    const parsed = limitsConfigSchema.safeParse(config);
    if (!parsed.success) throw new PontError("configuration_error", `Configuration des plafonds invalide : ${parsed.error.issues.map((i) => i.message).join(" ; ")}`);
    this.config = parsed.data;
  }

  /** À appeler AVANT de bloquer ou créditer des fonds (R-035). */
  async check(input: { userId: string; currency: Currency; operation: Operation; amount: number }): Promise<LimitDecision> {
    const outgoing = OUTGOING.has(input.operation);
    if (outgoing && (await this.profiles.isFrozen(input.userId))) {
      return { allowed: false, code: "frozen", message: "Compte gelé : aucune sortie autorisée." };
    }
    const tierName = await this.profiles.getTier(input.userId);
    const tier = tierName ? this.config.tiers[tierName] : undefined;
    if (!tier) return { allowed: false, code: "unknown_tier", message: "Palier KYC inconnu pour cet utilisateur." };

    if (input.amount > tier.maxSingle) {
      return { allowed: false, code: "max_single", message: `Opération limitée à ${fmt(tier.maxSingle, input.currency)} pour ce palier.` };
    }
    if (INCOMING.has(input.operation)) {
      const balance = await this.wallets.balance(input.userId, input.currency);
      if (balance.available + balance.held + input.amount > tier.maxBalance) {
        return { allowed: false, code: "max_balance", message: `Solde limité à ${fmt(tier.maxBalance, input.currency)} pour ce palier.` };
      }
    }
    if (outgoing) {
      const now = this.now();
      const daily = await this.wallets.outflows(input.userId, input.currency, now - DAY);
      if (daily + input.amount > tier.maxDailyOut) {
        return { allowed: false, code: "max_daily_out", message: `Sorties limitées à ${fmt(tier.maxDailyOut, input.currency)} sur 24 h (déjà ${fmt(daily, input.currency)}).` };
      }
      const monthly = await this.wallets.outflows(input.userId, input.currency, now - 30 * DAY);
      if (monthly + input.amount > tier.maxMonthlyOut) {
        return { allowed: false, code: "max_monthly_out", message: `Sorties limitées à ${fmt(tier.maxMonthlyOut, input.currency)} sur 30 jours.` };
      }
    }
    return { allowed: true };
  }
}
