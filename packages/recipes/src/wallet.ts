import { PontError, type Country, type Currency, type Operator, type Payment, type Payout } from "@pont-bj/core";
import type { PontEngine, PontEvent } from "@pont-bj/engine";
import { MemoryWorkflowRunStore, createWorkflow, defineRecipe, type WorkflowRun, type WorkflowRunStore } from "@pont-bj/framework";
import type { Limits, Wallets } from "@pont-bj/ledger";

// Recette « Portefeuille mobile » (ADR-003) : relie le moteur de paiement, le registre et les plafonds.

export const walletRecipe = defineRecipe({
  id: "wallet",
  title: "Portefeuille mobile",
  description:
    "Comptes utilisateurs avec solde : dépôts par mobile money, retraits, transferts entre utilisateurs, frais et plafonds par palier KYC. " +
    "À choisir pour une application de type portefeuille, porte-monnaie électronique, néobanque légère.",
  status: "preview",
  keywords: ["portefeuille", "wallet", "porte-monnaie", "solde", "transfert", "neobanque", "recharge", "retrait"],
  modules: ["payments", "ledger", "wallets", "limits"],
  workflows: ["wallet.withdraw"],
  config: {
    limits: {
      tiers: {
        basique: { maxBalance: 200_000, maxSingle: 50_000, maxDailyOut: 100_000, maxMonthlyOut: 500_000 },
        complet: { maxBalance: 2_000_000, maxSingle: 500_000, maxDailyOut: 1_000_000, maxMonthlyOut: 5_000_000 },
      },
    },
  },
  templates: [{ stack: "next-app", path: "lib/pont-wallet.ts", template: "wallet/next-lib" }],
  checks: ["success", "insufficient_funds", "declined_by_customer"],
});

/** Métadonnées posées sur les opérations Pont pour les relier au portefeuille. */
const META_USER = "pont_wallet_user";
const META_HOLD = "pont_wallet_hold";
/** Frais figés à la demande : la grille peut changer avant la confirmation. */
const META_FEE = "pont_wallet_fee";

export class LimitExceededError extends PontError {
  constructor(readonly limitCode: string, message: string) {
    super("invalid_request", message);
  }
}

export interface WalletServiceOptions {
  engine: PontEngine;
  wallets: Wallets;
  limits: Limits;
  currency: Currency;
  workflowStore?: WorkflowRunStore;
  /** Frais de retrait prélevés par la fintech (unités entières), calculés à partir du montant. */
  withdrawalFee?: (amount: number) => number;
}

export interface DepositInput {
  userId: string;
  amount: number;
  country: Country;
  phone: string;
  operator?: Operator;
  reference: string;
}

export interface WithdrawInput {
  userId: string;
  amount: number;
  country: Country;
  operator: Operator;
  phone: string;
  reference: string;
}

export type EventOutcome = "credited" | "settled" | "released" | "ignored";

export class WalletService {
  private readonly options: WalletServiceOptions;
  private readonly runs: WorkflowRunStore;
  private readonly withdrawWorkflow;

  constructor(options: WalletServiceOptions) {
    this.options = options;
    this.runs = options.workflowStore ?? new MemoryWorkflowRunStore();
    const { wallets, limits, engine, currency } = options;

    // Retrait (R-033, R-035) : contrôler, bloquer, envoyer. Un envoi refusé restitue les fonds.
    this.withdrawWorkflow = createWorkflow<WithdrawInput & { holdId: string; fee: number }>("wallet.withdraw", [
      {
        name: "verifier-plafonds",
        invoke: async (input) => {
          const decision = await limits.check({ userId: input.userId, currency, operation: "withdraw", amount: input.amount + input.fee });
          if (!decision.allowed) throw new LimitExceededError(decision.code, decision.message);
          return { allowed: true };
        },
      },
      {
        name: "bloquer-fonds",
        invoke: async (input) => {
          // Les frais s'ajoutent au montant envoyé : on bloque le total (voir Wallets.settle).
          await wallets.hold({ userId: input.userId, currency, amount: input.amount + input.fee, holdId: input.holdId });
          return { held: input.amount + input.fee };
        },
        compensate: async (input) => {
          await wallets.release({ userId: input.userId, currency, amount: input.amount + input.fee, holdId: input.holdId });
        },
      },
      {
        name: "envoyer",
        invoke: async (input, context) => {
          const payout = await engine.createPayout(
            {
              amount: input.amount,
              currency,
              country: input.country,
              operator: input.operator,
              recipient: { phone: input.phone },
              reference: input.reference,
              metadata: { [META_USER]: input.userId, [META_HOLD]: input.holdId, [META_FEE]: String(input.fee) },
            },
            context.idempotencyKey("envoyer"),
          );
          if (payout.status === "failed") throw new PontError("provider_rejected", payout.failureCode ?? "retrait refusé");
          return { payoutId: payout.id, status: payout.status };
        },
      },
    ]);
  }

  /** Démarre un dépôt : contrôle des plafonds, puis paiement. Le crédit intervient à la confirmation (R-032). */
  async startDeposit(input: DepositInput, idempotencyKey: string): Promise<Payment> {
    const decision = await this.options.limits.check({ userId: input.userId, currency: this.options.currency, operation: "deposit", amount: input.amount });
    if (!decision.allowed) throw new LimitExceededError(decision.code, decision.message);
    return this.options.engine.createPayment(
      {
        amount: input.amount,
        currency: this.options.currency,
        country: input.country,
        customer: { phone: input.phone },
        ...(input.operator ? { operator: input.operator } : {}),
        reference: input.reference,
        metadata: { [META_USER]: input.userId },
      },
      idempotencyKey,
    );
  }

  /** Demande un retrait. Renvoie l'exécution du workflow (statut `compensated` si refusé, fonds restitués). */
  async withdraw(input: WithdrawInput, idempotencyKey: string): Promise<WorkflowRun> {
    const fee = this.options.withdrawalFee?.(input.amount) ?? 0;
    if (!Number.isInteger(fee) || fee < 0) throw new PontError("configuration_error", "withdrawalFee doit renvoyer un entier positif ou nul.");
    return this.withdrawWorkflow.run({ ...input, holdId: `wd_${idempotencyKey}`, fee }, { idempotencyKey, store: this.runs });
  }

  /**
   * À brancher sur `onEvent` du moteur. Crédite les dépôts confirmés, solde ou restitue les retraits.
   * Idempotent : un événement rejoué ne crédite jamais deux fois (clés d'écriture dérivées des identifiants).
   */
  async handleEvent(event: PontEvent): Promise<EventOutcome> {
    const { wallets, currency } = this.options;
    if (event.object === "payment" && event.type === "payment.succeeded") {
      const payment: Payment = event.data;
      const userId = payment.metadata[META_USER];
      if (!userId || payment.currency !== currency) return "ignored";
      await wallets.deposit({ userId, currency, amount: payment.amount, provider: payment.provider, paymentId: payment.id });
      return "credited";
    }
    if (event.object === "payout") {
      const payout: Payout = event.data;
      const userId = payout.metadata[META_USER];
      const holdId = payout.metadata[META_HOLD];
      if (!userId || !holdId) return "ignored";
      const fee = Number(payout.metadata[META_FEE] ?? "0");
      if (event.type === "payout.succeeded") {
        await wallets.settle({ userId, currency, amount: payout.amount, fee, holdId, provider: payout.provider });
        return "settled";
      }
      if (event.type === "payout.failed" || event.type === "payout.cancelled") {
        await wallets.release({ userId, currency, amount: payout.amount + fee, holdId });
        return "released";
      }
    }
    return "ignored";
  }
}
