import { z } from "zod";
import { PontError, type FetchLike, type Mode, type ProviderAdapter } from "@pont-bj/core";
import { MemoryPaymentStore } from "@pont-bj/engine";
import { createPontFromEnv } from "@pont-bj/node";
import type { Plugin, PluginLoadError } from "./plugins.js";
import { deleteProvider, isProviderKey, listProviders, mask, overlayEnv, saveProvider, storageKey, storedValues, type ProviderView } from "./providers.js";
import type { Vault } from "./vault.js";

type Source = Record<string, string | undefined>;

const inputSchema = z.record(z.string().min(1).max(4000));

/** Agrégateurs intégrés + personnalisés (`PONT_PLUGINS_DIR`) derrière une seule porte : liste, saisie des clés, suppression. */
export class ProviderRegistry {
  constructor(
    readonly plugins: Plugin[] = [],
    readonly loadErrors: PluginLoadError[] = [],
    /** Remplace `fetch` dans les adaptateurs personnalisés (tests). */
    private readonly fetchImpl?: FetchLike,
  ) {}

  has(id: string): boolean {
    return isProviderKey(id) || this.plugins.some((plugin) => plugin.id === id);
  }

  private plugin(id: string): Plugin | undefined {
    return this.plugins.find((plugin) => plugin.id === id);
  }

  private fieldsOf(plugin: Plugin): string[] {
    return [...plugin.keys, "webhookSecret"];
  }

  /** Valeurs d'un plugin : le coffre l'emporte sur les variables d'environnement. */
  private async resolved(plugin: Plugin, source: Source, vault: Vault | null): Promise<{ values: Record<string, string>; fromVault: boolean }> {
    const stored = vault ? await storedValues(vault, plugin.id) : {};
    const values: Record<string, string> = {};
    for (const field of this.fieldsOf(plugin)) {
      const value = stored[field] || source[plugin.envName(field)];
      if (value) values[field] = value;
    }
    return { values, fromVault: Object.keys(stored).length > 0 };
  }

  /** Adaptateurs des plugins dont les clés sont renseignées. Des clés à moitié saisies sont une erreur, pas un silence. */
  async adapters(source: Source, vault: Vault | null, mode: Mode, except?: string): Promise<ProviderAdapter[]> {
    const adapters: ProviderAdapter[] = [];
    for (const plugin of this.plugins) {
      if (plugin.id === except) continue;
      const { values } = await this.resolved(plugin, source, vault);
      const present = Object.keys(values).length;
      if (present === 0) continue;
      const missing = this.fieldsOf(plugin).filter((field) => !values[field]);
      if (missing.length > 0) throw new PontError("configuration_error", `${plugin.label} : clés manquantes ${missing.join(", ")}.`);
      adapters.push(plugin.create(values, mode, this.fetchImpl));
    }
    return adapters;
  }

  async list(source: Source, vault: Vault | null, publicUrl: string, hooksPath: string): Promise<{ data: ProviderView[]; pluginErrors: PluginLoadError[] }> {
    const data = await listProviders(source, vault, publicUrl, hooksPath);
    const base = publicUrl.replace(/\/$/, "");
    for (const plugin of this.plugins) {
      const { values, fromVault } = await this.resolved(plugin, source, vault);
      const fields = this.fieldsOf(plugin).map((name) => ({
        name,
        label: name,
        secret: true,
        required: true,
        set: Boolean(values[name]),
        value: values[name] ? mask(values[name]) : null,
      }));
      const configured = fields.every((field) => field.set);
      data.push({ id: plugin.id, custom: true, label: plugin.label, source: fromVault ? "vault" : configured ? "env" : "none", configured, webhookUrl: `${base}${hooksPath}/${plugin.id}`, fields });
    }
    return { data, pluginErrors: this.loadErrors };
  }

  async save(id: string, input: unknown, source: Source, vault: Vault, mode: Mode): Promise<void> {
    const plugin = this.plugin(id);
    if (!plugin) {
      return saveProvider(id as Parameters<typeof saveProvider>[0], input, source, vault, await this.adapters(source, vault, mode));
    }
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new PontError("invalid_request", "Corps invalide : un objet { champ: valeur } est attendu.");
    const fields = this.fieldsOf(plugin);
    const unknown = Object.keys(parsed.data).filter((name) => !fields.includes(name));
    if (unknown.length > 0) throw new PontError("invalid_request", `Champs inconnus pour ${plugin.label} : ${unknown.join(", ")}.`);
    const next = { ...(await storedValues(vault, id)), ...parsed.data };
    // Les variables d'environnement complètent le coffre : un champ déjà fourni par l'environnement compte comme présent.
    const merged = { ...Object.fromEntries(fields.flatMap((f) => (source[plugin.envName(f)] ? [[f, source[plugin.envName(f)]!]] : []))), ...next };
    const missing = fields.filter((field) => !merged[field]);
    if (missing.length > 0) throw new PontError("configuration_error", `${plugin.label} : clés manquantes ${missing.join(", ")}.`);
    const trial = plugin.create(merged, mode, this.fetchImpl);
    // Le moteur applique ses règles (Kkiapay seul, pas de doublon…) sans contacter personne.
    createPontFromEnv({
      env: { ...(await overlayEnv(source, vault)), PONT_SANDBOX: "false" },
      stores: { payments: new MemoryPaymentStore() },
      extraAdapters: [...(await this.adapters(source, vault, mode, id)), trial],
    });
    await vault.putJson(storageKey(id), next);
  }

  async remove(id: string, vault: Vault): Promise<void> {
    await (this.plugin(id) ? vault.delete(storageKey(id)) : deleteProvider(id as Parameters<typeof deleteProvider>[0], vault));
  }
}
