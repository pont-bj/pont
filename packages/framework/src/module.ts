import { PontError } from "@pont/core";

// Contrat de module du framework (ADR-003). Un module est une unité indépendante : son nom, ses dépendances,
// sa licence (open core) et la fabrique de ses services, qui reçoit les services des modules dont il dépend.

export type ModuleLicense = "open" | "proprietary";

export interface ModuleContext {
  /** Services déjà construits des modules dont celui-ci dépend. */
  get<T>(moduleName: string): T;
  /** Configuration propre au module. */
  config: Record<string, unknown>;
}

export interface PontModule<TServices = unknown> {
  name: string;
  version: string;
  license: ModuleLicense;
  description: string;
  dependsOn?: string[];
  create(context: ModuleContext): TServices | Promise<TServices>;
}

export function defineModule<TServices>(module: PontModule<TServices>): PontModule<TServices> {
  if (!/^[a-z][a-z0-9-]*$/.test(module.name)) {
    throw new PontError("configuration_error", `Nom de module invalide : « ${module.name} » (minuscules, chiffres, tirets).`);
  }
  return module;
}

/** Ordre de construction : chaque module après ses dépendances. Refuse dépendance manquante et cycle. */
export function resolveOrder(modules: PontModule[]): PontModule[] {
  const byName = new Map<string, PontModule>();
  for (const module of modules) {
    if (byName.has(module.name)) throw new PontError("configuration_error", `Module « ${module.name} » déclaré deux fois.`);
    byName.set(module.name, module);
  }
  const ordered: PontModule[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (module: PontModule, path: string[]) => {
    const current = state.get(module.name);
    if (current === "done") return;
    if (current === "visiting") {
      throw new PontError("configuration_error", `Dépendance circulaire : ${[...path, module.name].join(" → ")}.`);
    }
    state.set(module.name, "visiting");
    for (const dependency of module.dependsOn ?? []) {
      const target = byName.get(dependency);
      if (!target) {
        throw new PontError("configuration_error", `Le module « ${module.name} » dépend de « ${dependency} », qui n'est pas installé.`, `Ajoutez le module « ${dependency} ».`);
      }
      visit(target, [...path, module.name]);
    }
    state.set(module.name, "done");
    ordered.push(module);
  };
  for (const module of modules) visit(module, []);
  return ordered;
}

export interface PontApp {
  /** Services d'un module installé. */
  module<T>(name: string): T;
  modules: Array<Pick<PontModule, "name" | "version" | "license">>;
}

/** Construit l'application : modules résolus dans l'ordre, chacun ne voit que ses dépendances déclarées. */
export async function createApp(options: { modules: PontModule[]; config?: Record<string, Record<string, unknown>> }): Promise<PontApp> {
  const services = new Map<string, unknown>();
  const ordered = resolveOrder(options.modules);
  for (const module of ordered) {
    const allowed = new Set(module.dependsOn ?? []);
    const context: ModuleContext = {
      config: options.config?.[module.name] ?? {},
      get<T>(name: string): T {
        if (!allowed.has(name)) {
          throw new PontError("configuration_error", `Le module « ${module.name} » utilise « ${name} » sans l'avoir déclaré dans dependsOn.`);
        }
        return services.get(name) as T;
      },
    };
    services.set(module.name, await module.create(context));
  }
  return {
    modules: ordered.map(({ name, version, license }) => ({ name, version, license })),
    module<T>(name: string): T {
      if (!services.has(name)) throw new PontError("configuration_error", `Module « ${name} » non installé.`);
      return services.get(name) as T;
    },
  };
}
