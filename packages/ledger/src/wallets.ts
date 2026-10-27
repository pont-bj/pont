import { PontError, type Currency } from "@pont/core";
import type { Account, Ledger, PostResult } from "./ledger.js";

// Portefeuilles utilisateurs au-dessus du registre (R-031 à R-033).
//
// Comptes par utilisateur : `available` et `held` (sens crédit : ce que la fintech doit à l'utilisateur).
// Comptes système par agrégateur et devise : `transit` (sens débit : fonds de la fintech chez l'agrégateur),
// et `fees` (sens crédit : revenus de la fintech).

export interface WalletBalance {
  available: number;
  held: number;
  currency: Currency;
}

export class InsufficientFundsError extends PontError {
  constructor(readonly available: number, readonly required: number) {
    super("invalid_request", `Solde insuffisant : ${available} disponible, ${required} requis.`);
  }
}

const code = {
  available: (userId: string, currency: Currency) => `wallet:${userId}:${currency}:available`,
  held: (userId: string, currency: Currency) => `wallet:${userId}:${currency}:held`,
  transit: (provider: string, currency: Currency) => `system:transit:${provider}:${currency}`,
  fees: (currency: Currency) => `system:fees:${currency}`,
};

function assertPosted(result: PostResult): void {
  if (result.status === "insufficient_funds") throw new InsufficientFundsError(result.balance, result.required);
}

export class Wallets {
  constructor(private readonly ledger: Ledger) {}

  /** Ouvre (ou retrouve) le portefeuille d'un utilisateur. Idempotent. */
  async open(userId: string, currency: Currency): Promise<{ available: Account; held: Account }> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new PontError("invalid_request", "Identifiant utilisateur invalide.");
    const available = await this.ledger.openAccount({ code: code.available(userId, currency), currency, normal: "credit" });
    const held = await this.ledger.openAccount({ code: code.held(userId, currency), currency, normal: "credit" });
    return { available, held };
  }

  async balance(userId: string, currency: Currency): Promise<WalletBalance> {
    const { available, held } = await this.accounts(userId, currency);
    return { available: await this.ledger.balance(available), held: await this.ledger.balance(held), currency };
  }

  /** Crédite un dépôt confirmé (R-032). Clé = identifiant du paiement : un paiement n'est crédité qu'une fois. */
  async deposit(input: { userId: string; currency: Currency; amount: number; provider: string; paymentId: string }): Promise<void> {
    const { available } = await this.accounts(input.userId, input.currency);
    const transit = await this.system("transit", input.provider, input.currency);
    assertPosted(
      await this.ledger.post({
        idempotencyKey: `deposit:${input.paymentId}`,
        currency: input.currency,
        description: `Dépôt ${input.paymentId}`,
        metadata: { paymentId: input.paymentId, userId: input.userId },
        lines: [
          { accountId: transit.id, direction: "debit", amount: input.amount },
          { accountId: available.id, direction: "credit", amount: input.amount },
        ],
      }),
    );
  }

  /** Bloque des fonds avant un retrait (R-033). Refuse si le disponible ne suffit pas (R-031). */
  async hold(input: { userId: string; currency: Currency; amount: number; holdId: string }): Promise<void> {
    const { available, held } = await this.accounts(input.userId, input.currency);
    assertPosted(
      await this.ledger.post({
        idempotencyKey: `hold:${input.holdId}`,
        currency: input.currency,
        description: `Blocage ${input.holdId}`,
        metadata: { holdId: input.holdId, userId: input.userId },
        lines: [
          { accountId: available.id, direction: "debit", amount: input.amount },
          { accountId: held.id, direction: "credit", amount: input.amount },
        ],
      }),
    );
  }

  /** Restitue des fonds bloqués (retrait échoué ou annulé). */
  async release(input: { userId: string; currency: Currency; amount: number; holdId: string }): Promise<void> {
    const { available, held } = await this.accounts(input.userId, input.currency);
    assertPosted(
      await this.ledger.post({
        idempotencyKey: `release:${input.holdId}`,
        currency: input.currency,
        description: `Déblocage ${input.holdId}`,
        metadata: { holdId: input.holdId, userId: input.userId },
        lines: [
          { accountId: held.id, direction: "debit", amount: input.amount },
          { accountId: available.id, direction: "credit", amount: input.amount },
        ],
      }),
    );
  }

  /** Solde un retrait confirmé : les fonds bloqués sortent vers le transit de l'agrégateur, frais éventuels compris. */
  async settle(input: { userId: string; currency: Currency; amount: number; fee?: number; holdId: string; provider: string }): Promise<void> {
    const { held } = await this.accounts(input.userId, input.currency);
    const transit = await this.system("transit", input.provider, input.currency);
    const fee = input.fee ?? 0;
    const lines = [
      { accountId: held.id, direction: "debit" as const, amount: input.amount },
      { accountId: transit.id, direction: "credit" as const, amount: input.amount - fee },
    ];
    if (fee > 0) lines.push({ accountId: (await this.system("fees", "", input.currency)).id, direction: "credit", amount: fee });
    if (fee >= input.amount) throw new PontError("invalid_request", "Les frais doivent être inférieurs au montant.");
    assertPosted(
      await this.ledger.post({
        idempotencyKey: `settle:${input.holdId}`,
        currency: input.currency,
        description: `Retrait ${input.holdId}`,
        metadata: { holdId: input.holdId, userId: input.userId },
        lines,
      }),
    );
  }

  /** Transfert interne entre utilisateurs, sans agrégateur, frais éventuels à la charge de l'émetteur. */
  async transfer(input: { from: string; to: string; currency: Currency; amount: number; fee?: number; transferId: string }): Promise<void> {
    if (input.from === input.to) throw new PontError("invalid_request", "Transfert vers soi-même interdit.");
    const from = await this.accounts(input.from, input.currency);
    const to = await this.accounts(input.to, input.currency);
    const fee = input.fee ?? 0;
    const lines = [
      { accountId: from.available.id, direction: "debit" as const, amount: input.amount + fee },
      { accountId: to.available.id, direction: "credit" as const, amount: input.amount },
    ];
    if (fee > 0) lines.push({ accountId: (await this.system("fees", "", input.currency)).id, direction: "credit", amount: fee });
    assertPosted(
      await this.ledger.post({
        idempotencyKey: `transfer:${input.transferId}`,
        currency: input.currency,
        description: `Transfert ${input.transferId}`,
        metadata: { transferId: input.transferId, from: input.from, to: input.to },
        lines,
      }),
    );
  }

  /** Mouvements sortants du disponible depuis une date (pour les plafonds). */
  async outflows(userId: string, currency: Currency, since: number): Promise<number> {
    const { available } = await this.accounts(userId, currency);
    const movements = await this.ledger.movements(available, { since });
    return movements.filter((m) => m.direction === "debit").reduce((sum, m) => sum + m.amount, 0);
  }

  private async accounts(userId: string, currency: Currency): Promise<{ available: Account; held: Account }> {
    try {
      return { available: await this.ledger.account(code.available(userId, currency)), held: await this.ledger.account(code.held(userId, currency)) };
    } catch {
      throw new PontError("payment_not_found", `Portefeuille ${currency} de « ${userId} » inexistant.`, "Appelez wallets.open(userId, currency) d'abord.");
    }
  }

  private system(kind: "transit" | "fees", provider: string, currency: Currency): Promise<Account> {
    return kind === "transit"
      ? this.ledger.openAccount({ code: code.transit(provider, currency), currency, normal: "debit", allowNegative: true })
      : this.ledger.openAccount({ code: code.fees(currency), currency, normal: "credit", allowNegative: true });
  }
}
