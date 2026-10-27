import { defineModule, type Recipe } from "@pont/framework";
import type { PontEngine } from "@pont/engine";
import { walletRecipe } from "./wallet.js";

export * from "./wallet.js";

/** Module `payments` : expose le moteur d'orchestration au framework. Config : `{ engine }`. */
export const paymentsModule = defineModule({
  name: "payments",
  version: "0.1.0",
  license: "open",
  description: "Encaissement, retraits et remboursements multi-agrégateurs (moteur Pont).",
  create: (ctx) => {
    const engine = ctx.config.engine as PontEngine | undefined;
    if (!engine) throw new Error("Module payments : fournissez config.payments.engine (createPontFromEnv()).");
    return engine;
  },
});

/** Catalogue des recettes disponibles (lu par la CLI et le MCP). */
export const RECIPES: Recipe[] = [walletRecipe];
