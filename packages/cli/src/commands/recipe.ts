import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { matchRecipes, type Recipe } from "@pont-bj/framework";
import { RECIPES } from "@pont-bj/recipes";
import { detectProject, installCommand, type ProjectInfo } from "../project.js";

export interface RecipeSummary {
  id: string;
  title: string;
  status: Recipe["status"];
  description: string;
  modules: string[];
  score?: number;
}

function summarize(recipe: Recipe, score?: number): RecipeSummary {
  return { id: recipe.id, title: recipe.title, status: recipe.status, description: recipe.description, modules: recipe.modules, ...(score === undefined ? {} : { score }) };
}

/** Liste les recettes, classées selon une description libre si elle est fournie. */
export function listRecipes(description?: string): RecipeSummary[] {
  if (!description) return RECIPES.map((recipe) => summarize(recipe));
  return matchRecipes(RECIPES, description).map(({ recipe, score }) => summarize(recipe, score));
}

function walletTemplate(project: ProjectInfo): string {
  const pontImport = "./pont";
  return `import { Ledger, Limits, MemoryCustomerProfileStore, MemoryLedgerStore, Wallets } from "@pont-bj/ledger";
import { WalletService, walletRecipe } from "@pont-bj/recipes";
import type { PontEvent } from "@pont-bj/node";
import { pont } from "${pontImport}";

// Recette « Portefeuille mobile » générée par \`pont add recipe wallet\`.
// Stockage en mémoire pour démarrer. En production : PrismaLedgerStore (@pont-bj/store-prisma),
// pour que les soldes survivent aux redémarrages et restent exacts sous concurrence.
const ledger = new Ledger(new MemoryLedgerStore());
export const wallets = new Wallets(ledger);

// Paliers KYC : remplacez par vos données clients (profiles.setTier(userId, "basique" | "complet")).
export const profiles = new MemoryCustomerProfileStore();
const limits = new Limits(walletRecipe.config.limits, wallets, profiles);

export const wallet = new WalletService({
  engine: pont,
  wallets,
  limits,
  currency: "XOF",
  // Frais de retrait de la fintech (ajoutés au montant envoyé, R-037).
  withdrawalFee: (amount${project.typescript ? ": number" : ""}) => Math.ceil(amount * 0.01),
});

/** À appeler depuis onEvent dans lib/pont : crédite les dépôts, solde ou restitue les retraits. */
export function handleWalletEvent(event${project.typescript ? ": PontEvent" : ""}) {
  return wallet.handleEvent(event);
}
`;
}

export interface AddRecipeResult {
  recipe: RecipeSummary | null;
  created: string[];
  skipped: string[];
  installCommand: string | null;
  manualSteps: string[];
}

/** Installe une recette dans le projet. N'écrase jamais un fichier existant. */
export function addRecipe(options: { cwd: string; recipeId: string; dryRun: boolean; log: (line: string) => void }): AddRecipeResult {
  const result: AddRecipeResult = { recipe: null, created: [], skipped: [], installCommand: null, manualSteps: [] };
  const recipe = RECIPES.find((r) => r.id === options.recipeId);
  if (!recipe) {
    options.log(`Recette inconnue : ${options.recipeId}. Disponibles : ${RECIPES.map((r) => r.id).join(", ")}`);
    return result;
  }
  result.recipe = summarize(recipe);
  const project = detectProject(options.cwd);
  if (project.stack !== "next-app") {
    options.log(`⚠️  La recette « ${recipe.title} » est générée pour Next.js (App Router) uniquement pour l'instant.`);
    return result;
  }

  const ext = project.typescript ? "ts" : "js";
  const path = `${project.srcDir ? "src/lib" : "lib"}/pont-wallet.${ext}`;
  if (!existsSync(join(options.cwd, `${project.srcDir ? "src/lib" : "lib"}/pont.${ext}`))) {
    result.manualSteps.push("Lancez d'abord `npx pont init` : la recette s'appuie sur lib/pont.");
  }
  const target = join(options.cwd, path);
  if (existsSync(target)) {
    result.skipped.push(path);
    options.log(`• existe déjà, inchangé : ${path}`);
  } else {
    if (!options.dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, walletTemplate(project));
    }
    result.created.push(path);
    options.log(`+ ${path}`);
  }

  result.installCommand = installCommand(project.packageManager, ["@pont-bj/ledger", "@pont-bj/recipes"]);
  result.manualSteps.push(
    "Dans lib/pont : onEvent: async (event) => { const { handleWalletEvent } = await import(\"./pont-wallet\"); await handleWalletEvent(event); }",
    "Ouvrez un portefeuille à l'inscription : await wallets.open(userId, \"XOF\") puis profiles.setTier(userId, \"basique\").",
    "Dépôt : await wallet.startDeposit({ userId, amount, country, phone, reference }, cléIdempotence).",
    "Retrait : await wallet.withdraw({ userId, amount, country, operator, phone, reference }, cléIdempotence).",
  );
  options.log(`→ Installez : ${result.installCommand}`);
  for (const step of result.manualSteps) options.log(`→ À faire : ${step}`);
  return result;
}
