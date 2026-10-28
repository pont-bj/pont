import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, parseProviderSpec, renderProvider, runProviderNew } from "../src/index.js";

const spec = {
  id: "monagregateur",
  label: "MonAgrégateur",
  countries: ["BJ"],
  currencies: ["XOF"],
  baseUrl: { test: "https://sandbox.mon.test/v1", live: "https://api.mon.test/v1" },
  keys: ["secretKey"],
  auth: { type: "bearer", key: "secretKey" },
  deposit: { method: "POST", path: "/payments", body: { amount: "{amount}", ref: "{attemptId}" }, response: { providerRef: "data.id" } },
  verify: { method: "GET", path: "/payments/{providerRef}", response: { status: "data.status" } },
  statusMap: { PAID: "succeeded", FAILED: "failed" },
  webhook: { header: "X-Sig", algorithm: "sha256", encoding: "hex", payload: "body", lookup: { path: "data.id", by: "providerRef" } },
};

const dir = () => mkdtempSync(join(tmpdir(), "pont-provider-"));
const silent = () => {};
const clone = () => structuredClone(spec) as Record<string, unknown>;

describe("pont provider new — description", () => {
  it("accepte une description valide", () => {
    expect(parseProviderSpec(spec).ok).toBe(true);
  });

  it.each([
    ["variable inconnue", (s: Record<string, unknown>) => ((s.deposit as { body: unknown }).body = { x: "{inconnue}" }), /inconnue/],
    ["clé d'authentification absente de keys", (s: Record<string, unknown>) => (s.auth = { type: "bearer", key: "autre" }), /pas dans keys/],
    ["nom de clé réservé", (s: Record<string, unknown>) => (s.keys = ["webhookSecret"]), /réservé/],
    ["http hors localhost", (s: Record<string, unknown>) => (s.baseUrl = { test: "http://sandbox.mon.test", live: "https://api.mon.test" }), /https/],
    ["identifiant invalide", (s: Record<string, unknown>) => (s.id = "../evil"), /3 à 20/],
    ["retrait sans vérification", (s: Record<string, unknown>) => ((s.payout = { method: "POST", path: "/p", response: { providerRef: "id" } }), (s.transferStatusMap = { OK: "succeeded" })), /vérification/],
    ["retrait sans table de statuts", (s: Record<string, unknown>) => ((s.payout = { method: "POST", path: "/p", response: { providerRef: "id" } }), (s.verifyPayout = { method: "GET", path: "/p/{providerRef}", response: { status: "s" } })), /Table de statuts/],
    ["statut Pont inconnu", (s: Record<string, unknown>) => (s.statusMap = { OK: "paid" }), /Invalid/i],
    ["horodatage sans en-tête", (s: Record<string, unknown>) => ((s.webhook as { payload: string }).payload = "timestamp.body"), /timestampHeader/],
    ["chemin de réponse injectable", (s: Record<string, unknown>) => ((s.verify as { response: { status: string } }).response.status = "a;b"), /Chemin/],
  ])("refuse : %s", (_name, mutate, message) => {
    const candidate = clone();
    mutate(candidate);
    const result = parseProviderSpec(candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(message);
  });
});

describe("pont provider new — génération", () => {
  it("produit un dossier autonome sans secret ni any", () => {
    const parsed = parseProviderSpec(spec);
    if (!parsed.ok) throw new Error("spec");
    const files = renderProvider(parsed.spec);
    expect(files.map((f) => f.path)).toEqual(["package.json", "tsconfig.json", "spec.json", "src/index.ts", "test/adapter.test.ts", "README.md"]);
    const source = files.find((f) => f.path === "src/index.ts")!.content;
    expect(source).toContain("class MonagregateurAdapter implements ProviderAdapter");
    expect(source).toContain("safeEqual");
    expect(source).not.toMatch(/:\s*any\b|as any\b/);
    expect(JSON.parse(files.find((f) => f.path === "package.json")!.content).name).toBe("pont-adapter-monagregateur");
  });

  it("écrit les fichiers, refuse d'écraser sans --force, et --dry-run n'écrit rien", async () => {
    const cwd = dir();
    writeFileSync(join(cwd, "spec.json"), JSON.stringify(spec));
    const dry = await runProviderNew({ cwd, from: "spec.json", force: false, dryRun: true, log: silent });
    expect(dry.ok).toBe(true);
    expect(existsSync(join(cwd, "pont-adapter-monagregateur"))).toBe(false);

    const first = await runProviderNew({ cwd, from: "spec.json", force: false, dryRun: false, log: silent });
    expect(first.ok).toBe(true);
    expect(readFileSync(join(cwd, "pont-adapter-monagregateur/src/index.ts"), "utf8")).toContain("MonAgrégateur");

    const again = await runProviderNew({ cwd, from: "spec.json", force: false, dryRun: false, log: silent });
    expect(again.ok).toBe(false);
    expect(again.errors[0]).toMatch(/--force/);
    expect((await runProviderNew({ cwd, from: "spec.json", force: true, dryRun: false, log: silent })).ok).toBe(true);
  });

  it("signale un fichier absent ou un JSON invalide", async () => {
    const cwd = dir();
    expect((await runProviderNew({ cwd, from: "absent.json", force: false, dryRun: false, log: silent })).errors[0]).toMatch(/introuvable/);
    writeFileSync(join(cwd, "mauvais.json"), "{");
    expect((await runProviderNew({ cwd, from: "mauvais.json", force: false, dryRun: false, log: silent })).errors[0]).toMatch(/JSON/);
  });

  it("mode questions : les réponses donnent la même description qu'un fichier", async () => {
    const answers: Array<[RegExp, string]> = [
      [/^Identifiant court/, "monagregateur"],
      [/^Nom affiché/, "MonAgrégateur"],
      [/^Pays/, "BJ"],
      [/^Devises/, "XOF"],
      [/^URL de base TEST/, "https://sandbox.mon.test/v1"],
      [/^URL de base LIVE/, "https://api.mon.test/v1"],
      [/^Noms des clés/, "secretKey"],
      [/^Authentification/, "bearer"],
      [/^Clé envoyée en Bearer/, "secretKey"],
      [/^Création de paiement : méthode/, "POST"],
      [/^Création de paiement : chemin \(/, "/payments"],
      [/^Création de paiement : corps/, '{"amount":"{amount}","ref":"{attemptId}"}'],
      [/^Création de paiement : chemin de l'identifiant/, "data.id"],
      [/^Création de paiement : chemin de l'URL/, ""],
      [/^Vérification de paiement : méthode/, "GET"],
      [/^Vérification de paiement : chemin \(/, "/payments/{providerRef}"],
      [/^Vérification : chemin du statut/, "data.status"],
      [/^Vérification : chemin du montant/, ""],
      [/^Vérification : chemin de la devise/, ""],
      [/^Vérification : chemin du code/, ""],
      [/^Vérification : chemin où/, ""],
      [/^Statuts de paiement/, "PAID=succeeded,FAILED=failed"],
      [/^Gérer les retraits/, "n"],
      [/^Gérer les remboursements/, "n"],
      [/^En-tête qui porte/, "X-Sig"],
      [/^Algorithme/, "sha256"],
      [/^Encodage/, "hex"],
      [/^Texte avant/, ""],
      [/^Charge signée/, "body"],
      [/^Chemin de l'identifiant de l'opération/, "data.id"],
      [/^Cet identifiant/, "providerRef"],
    ];
    const asked: string[] = [];
    const ask = async (question: string, fallback?: string): Promise<string> => {
      asked.push(question);
      const hit = answers.find(([pattern]) => pattern.test(question));
      if (!hit) return fallback ?? "";
      return hit[1];
    };
    const cwd = dir();
    const result = await runProviderNew({ cwd, force: false, dryRun: false, log: silent, ask });
    expect(result.errors).toEqual([]);
    const written = JSON.parse(readFileSync(join(cwd, "pont-adapter-monagregateur/spec.json"), "utf8"));
    const expected = parseProviderSpec(spec);
    if (!expected.ok) throw new Error("spec");
    expect(written).toEqual(expected.spec);
  });

  it("la commande CLI renvoie 1 avec les erreurs de validation, 0 en cas de succès", async () => {
    const cwd = dir();
    writeFileSync(join(cwd, "bad.json"), JSON.stringify({ ...spec, id: "X" }));
    writeFileSync(join(cwd, "good.json"), JSON.stringify(spec));
    const lines: string[] = [];
    expect(await main(["provider", "new", "--from", "bad.json"], cwd, (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("✖ id");
    expect(await main(["provider", "new", "--from", "good.json", "--out", "sortie"], cwd, () => {})).toBe(0);
    expect(existsSync(join(cwd, "sortie/src/index.ts"))).toBe(true);
    expect(await main(["provider"], cwd, () => {})).toBe(1);
  });
});
