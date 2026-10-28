import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { CUSTOM_PROVIDER_ID, PontError, type FetchLike, type Mode, type ProviderAdapter } from "@pont-bj/core";

/** Agrégateurs intégrés : un plugin ne peut pas prendre leur identifiant. */
const BUILT_IN = new Set(["fedapay", "paydunya", "cinetpay", "kkiapay", "pawapay", "sandbox"]);

/** Ce que Pont lit dans le `spec.json` d'un adaptateur généré (le reste concerne l'adaptateur lui-même). */
const pluginSpec = z.object({
  id: z.string().regex(CUSTOM_PROVIDER_ID),
  label: z.string().min(2).max(60),
  keys: z.array(z.string().regex(/^[a-z][A-Za-z0-9]{1,30}$/)).min(1).max(8),
});

/** Point d'entrée cherché dans le dossier du plugin, dans cet ordre (`src/index.ts` suppose un serveur lancé avec tsx, ce que fait `pnpm start`). */
const ENTRIES = ["dist/index.js", "index.js", "src/index.ts", "index.ts"];

type AdapterConstructor = new (config: Record<string, unknown>) => ProviderAdapter;

export interface Plugin {
  id: string;
  label: string;
  /** Noms des clés demandées (issus de `spec.json`) ; `webhookSecret` s'y ajoute toujours. */
  keys: string[];
  dir: string;
  /** Variable d'environnement de repli d'un champ (`MONAGREGATEUR_SECRET_KEY`). */
  envName(field: string): string;
  create(values: Record<string, string>, mode: Mode, fetch?: FetchLike): ProviderAdapter;
}

export interface PluginLoadError {
  dir: string;
  message: string;
}

export interface PluginLoad {
  plugins: Plugin[];
  errors: PluginLoadError[];
}

const snakeUpper = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

async function loadOne(dir: string): Promise<Plugin> {
  const specPath = join(dir, "spec.json");
  if (!(await exists(specPath))) throw new Error("spec.json absent (il est généré avec l'adaptateur par `pont provider new`).");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(specPath, "utf8"));
  } catch {
    throw new Error("spec.json illisible (JSON invalide).");
  }
  const parsed = pluginSpec.safeParse(raw);
  if (!parsed.success) throw new Error(`spec.json invalide : ${parsed.error.issues.map((i) => `${i.path.join(".") || "(racine)"} ${i.message}`).join(" ; ")}`);
  const { id, label, keys } = parsed.data;
  if (BUILT_IN.has(id)) throw new Error(`l'identifiant « ${id} » appartient à un agrégateur intégré.`);
  if (new Set(keys).size !== keys.length || keys.includes("webhookSecret")) throw new Error("noms de clés en double ou réservés (webhookSecret s'ajoute tout seul).");

  let entry: string | undefined;
  for (const candidate of ENTRIES) if (await exists(join(dir, candidate))) {
    entry = join(dir, candidate);
    break;
  }
  if (!entry) throw new Error(`aucun point d'entrée (${ENTRIES.join(", ")}). Compilez l'adaptateur (pnpm build) ou fournissez src/index.ts.`);

  // Exécute le code du dossier : c'est celui du propriétaire du serveur (voir la doc « Brancher un agrégateur »).
  const module: unknown = await import(pathToFileURL(entry).href);
  const exported = typeof module === "object" && module !== null ? Object.entries(module as Record<string, unknown>) : [];
  const found = exported.find(([name, value]) => typeof value === "function" && (name.endsWith("Adapter") || name === "default"));
  if (!found) throw new Error("aucune classe *Adapter exportée.");
  const Adapter = found[1] as AdapterConstructor;
  const prefix = id.toUpperCase();

  return {
    id,
    label,
    keys,
    dir,
    envName: (field) => `${prefix}_${field === "webhookSecret" ? "WEBHOOK_SECRET" : snakeUpper(field)}`,
    create(values, mode, fetch) {
      const adapter = new Adapter({ ...values, mode, ...(fetch ? { fetch } : {}) });
      if (adapter.id !== id) throw new PontError("configuration_error", `Le plugin ${id} déclare l'identifiant « ${adapter.id} » : spec.json et code ne correspondent pas.`);
      return adapter;
    },
  };
}

/** Charge chaque sous-dossier de `dir`. Un plugin défaillant est signalé sans empêcher le serveur de démarrer. */
export async function loadPlugins(dir: string | undefined): Promise<PluginLoad> {
  const result: PluginLoad = { plugins: [], errors: [] };
  if (!dir) return result;
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules").map((entry) => entry.name).sort();
  } catch {
    result.errors.push({ dir, message: "dossier des plugins introuvable ou illisible." });
    return result;
  }
  for (const name of names) {
    const path = join(dir, name);
    try {
      const plugin = await loadOne(path);
      if (result.plugins.some((p) => p.id === plugin.id)) throw new Error(`identifiant « ${plugin.id} » déjà fourni par un autre dossier.`);
      result.plugins.push(plugin);
    } catch (error) {
      result.errors.push({ dir: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
