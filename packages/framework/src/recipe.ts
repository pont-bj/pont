import { z } from "zod";
import { PontError } from "@pont-bj/core";
import type { PontModule } from "./module.js";

// Format des recettes (cas d'usage) : déclaratif, lisible par la CLI (`pont add recipe`) et le MCP (`apply_recipe`).

const moduleName = z.string().regex(/^[a-z][a-z0-9-]*$/);

export const recipeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1),
    /** Description pour un humain et pour un agent IA (quand choisir cette recette). */
    description: z.string().min(1),
    status: z.enum(["available", "preview", "planned"]),
    /** Mots-clés aidant un agent à associer une description libre à la recette. */
    keywords: z.array(z.string().min(1)).default([]),
    modules: z.array(moduleName).min(1),
    workflows: z.array(z.string().min(1)).default([]),
    /** Configuration par défaut, par module. */
    config: z.record(moduleName, z.record(z.unknown())).default({}),
    /** Fichiers générés dans le projet, par stack. */
    templates: z
      .array(z.object({ stack: z.enum(["next-app", "express", "laravel"]), path: z.string().min(1), template: z.string().min(1) }))
      .default([]),
    /** Scénarios sandbox à exécuter après installation. */
    checks: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type Recipe = z.infer<typeof recipeSchema>;

export function defineRecipe(input: z.input<typeof recipeSchema>): Recipe {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) {
    throw new PontError("configuration_error", `Recette invalide : ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; ")}`);
  }
  for (const name of Object.keys(parsed.data.config)) {
    if (!parsed.data.modules.includes(name)) {
      throw new PontError("configuration_error", `Recette « ${parsed.data.id} » : configuration pour « ${name} », absent de modules.`);
    }
  }
  return parsed.data;
}

/** Vérifie qu'une recette peut être installée avec les modules disponibles (dépendances comprises). */
export function planRecipe(recipe: Recipe, available: PontModule[]): { modules: PontModule[]; missing: string[] } {
  const byName = new Map(available.map((module) => [module.name, module]));
  const selected = new Map<string, PontModule>();
  const missing: string[] = [];
  const add = (name: string) => {
    if (selected.has(name)) return;
    const module = byName.get(name);
    if (!module) {
      if (!missing.includes(name)) missing.push(name);
      return;
    }
    selected.set(name, module);
    for (const dependency of module.dependsOn ?? []) add(dependency);
  };
  for (const name of recipe.modules) add(name);
  return { modules: [...selected.values()], missing };
}

/** Classement simple des recettes pour une description libre (utilisé par le MCP). */
export function matchRecipes(recipes: Recipe[], description: string): Array<{ recipe: Recipe; score: number }> {
  const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = normalize(description).split(/\W+/).filter((word) => word.length > 2);
  return recipes
    .map((recipe) => {
      const haystack = normalize([recipe.title, recipe.description, ...recipe.keywords].join(" "));
      const keywordHits = recipe.keywords.filter((keyword) => normalize(description).includes(normalize(keyword))).length;
      const wordHits = words.filter((word) => haystack.includes(word)).length;
      return { recipe, score: keywordHits * 3 + wordHits };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}
