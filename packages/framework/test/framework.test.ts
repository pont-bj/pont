import { describe, expect, it } from "vitest";
import { PontError } from "@pont-bj/core";
import {
  MemoryWorkflowRunStore,
  createApp,
  createWorkflow,
  defineModule,
  defineRecipe,
  matchRecipes,
  planRecipe,
  resolveOrder,
} from "../src/index.js";

const mod = (name: string, dependsOn: string[] = [], create: () => unknown = () => ({ name })) =>
  defineModule({ name, version: "0.1.0", license: "open", description: name, dependsOn, create });

describe("modules", () => {
  it("construit dans l'ordre des dépendances", () => {
    const order = resolveOrder([mod("wallets", ["ledger"]), mod("ledger"), mod("limits", ["wallets"])]).map((m) => m.name);
    expect(order).toEqual(["ledger", "wallets", "limits"]);
  });

  it("refuse dépendance manquante, cycle, doublon et nom invalide", () => {
    expect(() => resolveOrder([mod("wallets", ["ledger"])])).toThrow(/n'est pas installé/);
    expect(() => resolveOrder([mod("a", ["b"]), mod("b", ["a"])])).toThrow(/circulaire/);
    expect(() => resolveOrder([mod("a"), mod("a")])).toThrow(/deux fois/);
    expect(() => mod("Wallets")).toThrow(PontError);
  });

  it("un module ne voit que ses dépendances déclarées", async () => {
    const app = await createApp({
      modules: [
        mod("ledger", [], () => ({ balance: () => 0 })),
        defineModule({ name: "wallets", version: "0.1.0", license: "proprietary", description: "", dependsOn: ["ledger"], create: (ctx) => ({ ledger: ctx.get("ledger") }) }),
      ],
    });
    expect(app.module<{ ledger: { balance(): number } }>("wallets").ledger.balance()).toBe(0);
    expect(app.modules.map((m) => `${m.name}:${m.license}`)).toEqual(["ledger:open", "wallets:proprietary"]);

    await expect(
      createApp({ modules: [mod("ledger"), defineModule({ name: "intrus", version: "0.1.0", license: "open", description: "", create: (ctx) => ctx.get("ledger") })] }),
    ).rejects.toThrow(/sans l'avoir déclaré/);
  });
});

describe("workflows avec compensation", () => {
  it("succès : toutes les étapes, résultats accessibles aux étapes suivantes", async () => {
    const workflow = createWorkflow<{ amount: number }>("retrait", [
      { name: "bloquer", invoke: async (input) => ({ held: input.amount }) },
      { name: "envoyer", invoke: async (_input, ctx) => ({ sent: (ctx.results.bloquer as { held: number }).held }) },
    ]);
    const run = await workflow.run({ amount: 5000 }, { idempotencyKey: "k1", store: new MemoryWorkflowRunStore() });
    expect(run.status).toBe("succeeded");
    expect(run.output).toEqual({ bloquer: { held: 5000 }, envoyer: { sent: 5000 } });
  });

  it("échec : compense les étapes réussies dans l'ordre inverse", async () => {
    const journal: string[] = [];
    const workflow = createWorkflow<{ amount: number }>("retrait", [
      { name: "bloquer", invoke: async () => journal.push("bloquer"), compensate: async () => void journal.push("débloquer") },
      { name: "frais", invoke: async () => journal.push("frais"), compensate: async () => void journal.push("rendre frais") },
      { name: "envoyer", invoke: async () => { throw new Error("agrégateur indisponible"); } },
    ]);
    const run = await workflow.run({ amount: 5000 }, { idempotencyKey: "k2", store: new MemoryWorkflowRunStore() });
    expect(run.status).toBe("compensated");
    expect(run.error).toBe("agrégateur indisponible");
    expect(journal).toEqual(["bloquer", "frais", "rendre frais", "débloquer"]);
    expect(run.steps.map((s) => `${s.name}:${s.status}`)).toEqual(["bloquer:compensated", "frais:compensated", "envoyer:failed"]);
  });

  it("compensation en échec : signalée, et les autres compensations continuent", async () => {
    const journal: string[] = [];
    const workflow = createWorkflow<object>("x", [
      { name: "a", invoke: async () => 1, compensate: async () => void journal.push("annuler a") },
      { name: "b", invoke: async () => 2, compensate: async () => { throw new Error("panne"); } },
      { name: "c", invoke: async () => { throw new Error("échec c"); } },
    ]);
    const run = await workflow.run({}, { idempotencyKey: "k3", store: new MemoryWorkflowRunStore() });
    expect(run.status).toBe("compensation_failed");
    expect(journal).toEqual(["annuler a"]);
    expect(run.steps.find((s) => s.name === "b")).toMatchObject({ status: "compensation_failed", error: "panne" });
  });

  it("idempotent : même clé → même résultat, aucune réexécution", async () => {
    let calls = 0;
    const store = new MemoryWorkflowRunStore();
    const workflow = createWorkflow<object>("y", [{ name: "a", invoke: async () => ++calls }]);
    const first = await workflow.run({}, { idempotencyKey: "same", store });
    const second = await workflow.run({}, { idempotencyKey: "same", store });
    expect(second.id).toBe(first.id);
    expect(calls).toBe(1);
  });

  it("durable : chaque étape est persistée dès qu'elle se termine", async () => {
    const store = new MemoryWorkflowRunStore();
    const snapshots: string[] = [];
    const workflow = createWorkflow<object>("persist", [
      { name: "a", invoke: async () => "A" },
      { name: "b", invoke: async () => { snapshots.push(JSON.stringify((await store.get("persist", "p"))?.steps.map((s) => s.name))); return "B"; } },
    ]);
    await workflow.run({}, { idempotencyKey: "p", store });
    expect(snapshots).toEqual(['["a"]']);
  });

  it("reprise après arrêt : les étapes réussies ne sont pas rejouées, l'entrée d'origine fait foi", async () => {
    let now = 0;
    const store = new MemoryWorkflowRunStore();
    const calls: string[] = [];
    let crash = true;
    const workflow = createWorkflow<{ amount: number }>("reprise", [
      { name: "bloquer", invoke: async (input) => { calls.push(`bloquer ${input.amount}`); return input.amount; } },
      { name: "envoyer", invoke: async (input) => { if (crash) throw Object.assign(new Error("arrêt"), { crash: true }); calls.push(`envoyer ${input.amount}`); return "ok"; } },
    ]);
    // Simule un arrêt du serveur pendant « envoyer » : on intercepte avant la compensation.
    const crashing = createWorkflow<{ amount: number }>("reprise", [
      { name: "bloquer", invoke: async (input) => { calls.push(`bloquer ${input.amount}`); return input.amount; } },
      { name: "envoyer", invoke: () => new Promise(() => {}) },
    ]);
    void crashing.run({ amount: 5000 }, { idempotencyKey: "r", store, now: () => now, leaseMs: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await store.get("reprise", "r"))?.status).toBe("running");

    // Bail encore valide : une autre exécution est refusée.
    await expect(workflow.run({ amount: 5000 }, { idempotencyKey: "r", store, now: () => now })).rejects.toThrow(/déjà en cours/);

    // Bail expiré : reprise ; « bloquer » n'est pas rejoué, l'entrée d'origine (5000) est utilisée.
    now = 2_000;
    crash = false;
    const resumed = await workflow.run({ amount: 999 }, { idempotencyKey: "r", store, now: () => now });
    expect(resumed.status).toBe("succeeded");
    expect(calls).toEqual(["bloquer 5000", "envoyer 5000"]);
  });

  it("fournit des clés d'idempotence stables par étape pour les appels externes", async () => {
    const keys: string[] = [];
    const workflow = createWorkflow<object>("cles", [{ name: "payer", invoke: async (_i, ctx) => keys.push(ctx.idempotencyKey("payer")) }]);
    await workflow.run({}, { idempotencyKey: "commande-1", store: new MemoryWorkflowRunStore() });
    expect(keys).toEqual(["cles:commande-1:payer"]);
  });

  it("refuse un workflow vide ou des étapes en double", () => {
    expect(() => createWorkflow("vide", [])).toThrow(PontError);
    expect(() => createWorkflow("double", [{ name: "a", invoke: async () => 1 }, { name: "a", invoke: async () => 2 }])).toThrow(/double/);
  });
});

describe("recettes", () => {
  const wallet = defineRecipe({
    id: "wallet",
    title: "Portefeuille mobile",
    description: "Comptes utilisateurs avec dépôts, retraits, transferts, frais et plafonds KYC.",
    status: "preview",
    keywords: ["portefeuille", "wallet", "solde", "transfert"],
    modules: ["wallets", "limits", "payments"],
    config: { limits: { tiers: 3 } },
  });
  const tontine = defineRecipe({
    id: "tontine",
    title: "Tontine",
    description: "Cotisations périodiques et tours de versement.",
    status: "planned",
    keywords: ["tontine", "cotisation", "epargne collective"],
    modules: ["wallets", "schedules"],
  });

  it("valide le format et la cohérence de la configuration", () => {
    expect(() => defineRecipe({ id: "x", title: "X", description: "d", status: "planned", modules: [] })).toThrow(/Recette invalide/);
    expect(() => defineRecipe({ id: "x", title: "X", description: "d", status: "planned", modules: ["a"], config: { b: {} } })).toThrow(/absent de modules/);
  });

  it("planifie l'installation en ajoutant les dépendances et signale les modules manquants", () => {
    const plan = planRecipe(wallet, [mod("ledger"), mod("wallets", ["ledger"]), mod("limits", ["wallets"])]);
    expect(plan.modules.map((m) => m.name).sort()).toEqual(["ledger", "limits", "wallets"]);
    expect(plan.missing).toEqual(["payments"]);
  });

  it("associe une description libre à la bonne recette", () => {
    const ranked = matchRecipes([wallet, tontine], "Je crée une tontine au Bénin avec cotisations hebdomadaires");
    expect(ranked[0]?.recipe.id).toBe("tontine");
    expect(matchRecipes([wallet, tontine], "une appli de portefeuille avec transfert entre amis")[0]?.recipe.id).toBe("wallet");
  });
});
