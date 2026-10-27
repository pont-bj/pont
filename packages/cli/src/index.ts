import { parseArgs } from "node:util";
import { formatReport, runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { SCENARIO_NAMES, runTrigger } from "./commands/trigger.js";
import { addRecipe, listRecipes } from "./commands/recipe.js";

export { runInit, sandboxPayment } from "./commands/init.js";
export { runDoctor, formatReport } from "./commands/doctor.js";
export { runTrigger, SCENARIO_NAMES } from "./commands/trigger.js";
export { detectProject } from "./project.js";
export { addRecipe, listRecipes, type RecipeSummary, type AddRecipeResult } from "./commands/recipe.js";

const HELP = `pont — intégration des paiements africains

Commandes :
  pont init [--agent] [--stores convex] [--dry-run] [--no-test]
                                                 Intègre Pont dans le projet courant
  pont doctor [--ci] [--json]                    Audit de sécurité de l'intégration
  pont recipes [description]                     Liste les cas d'usage (classés si description)
  pont add recipe <id> [--dry-run]               Installe un cas d'usage (ex. wallet)
  pont trigger <scénario>                        Rejoue un scénario du sandbox
                                                 (${SCENARIO_NAMES.join(", ")})
`;

/** Point d'entrée testable : renvoie le code de sortie. */
export async function main(argv: string[], cwd: string, log: (line: string) => void = console.log): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      agent: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "no-test": { type: "boolean", default: false },
      stores: { type: "string" },
      ci: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;

  if (values.help || !command) {
    log(HELP);
    return command ? 0 : 1;
  }

  switch (command) {
    case "init": {
      if (values.stores !== undefined && values.stores !== "convex" && values.stores !== "memory") {
        log("--stores accepte : convex, memory");
        return 1;
      }
      const result = await runInit({ cwd, agent: values.agent, dryRun: values["dry-run"], testPayment: !values["no-test"], log, stores: values.stores ?? "memory" });
      return result.testPayment && !result.testPayment.ok ? 1 : 0;
    }
    case "doctor": {
      const report = runDoctor(cwd);
      log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
      return values.ci && !report.ok ? 1 : 0;
    }
    case "recipes": {
      for (const recipe of listRecipes(rest.join(" ") || undefined)) {
        log(`${recipe.id.padEnd(10)} ${recipe.title} [${recipe.status}] — ${recipe.modules.join(", ")}`);
      }
      return 0;
    }
    case "add": {
      if (rest[0] !== "recipe" || !rest[1]) {
        log("Usage : pont add recipe <id>");
        return 1;
      }
      const result = addRecipe({ cwd, recipeId: rest[1], dryRun: values["dry-run"], log });
      return result.recipe ? 0 : 1;
    }
    case "trigger": {
      const scenario = rest[0];
      if (!scenario) {
        log(`Précisez un scénario : ${SCENARIO_NAMES.join(", ")}`);
        return 1;
      }
      try {
        await runTrigger(scenario, log);
        return 0;
      } catch (error) {
        log(error instanceof Error ? error.message : String(error));
        return 1;
      }
    }
    default:
      log(`Commande inconnue : ${command}\n\n${HELP}`);
      return 1;
  }
}
