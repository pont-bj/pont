import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { main, runDoctor, runInit, runTrigger } from "../src/index.js";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pont-cli-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const nextProject = () =>
  project({
    "package.json": JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } }),
    "tsconfig.json": "{}",
    "pnpm-lock.yaml": "",
    "app/page.tsx": "export default function Page() { return null; }",
    ".gitignore": "node_modules\n",
  });

const silent = () => {};

describe("pont init — Next.js App Router", () => {
  it("génère les fichiers, l'env, le .gitignore, AGENTS.md et réussit le paiement test", async () => {
    const root = nextProject();
    const result = await runInit({ cwd: root, agent: true, dryRun: false, testPayment: true, log: silent });
    expect(result.project).toMatchObject({ stack: "next-app", packageManager: "pnpm", typescript: true });
    expect(result.created).toEqual([
      "lib/pont.ts",
      "app/api/pont/hooks/[provider]/route.ts",
      "app/api/pont/cron/route.ts",
      "app/pont-demo/actions.ts",
    ]);
    expect(result.installCommand).toBe("pnpm add @pont/node");
    expect(result.testPayment?.ok).toBe(true);

    const env = readFileSync(join(root, ".env.local"), "utf8");
    expect(env).toMatch(/PONT_SANDBOX=true/);
    expect(env).toMatch(/CRON_SECRET=[0-9a-f]{48}/);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/\.env\*\.local/);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("Montant côté serveur uniquement");
  });

  it("les imports relatifs générés pointent vers lib/pont", async () => {
    const root = nextProject();
    await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: silent });
    for (const route of ["app/api/pont/hooks/[provider]/route.ts", "app/api/pont/cron/route.ts", "app/pont-demo/actions.ts"]) {
      const content = readFileSync(join(root, route), "utf8");
      const target = /from "(\.[^"]+)"/.exec(content)?.[1];
      expect(target, route).toBeDefined();
      expect(existsSync(`${resolve(dirname(join(root, route)), target!)}.ts`), route).toBe(true);
    }
  });

  it("relancer init n'écrase rien et ne duplique ni l'env ni AGENTS.md", async () => {
    const root = nextProject();
    await runInit({ cwd: root, agent: true, dryRun: false, testPayment: false, log: silent });
    writeFileSync(join(root, "lib/pont.ts"), "// modifié par le développeur\n");
    const envBefore = readFileSync(join(root, ".env.local"), "utf8");
    const second = await runInit({ cwd: root, agent: true, dryRun: false, testPayment: false, log: silent });
    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(4);
    expect(readFileSync(join(root, "lib/pont.ts"), "utf8")).toBe("// modifié par le développeur\n");
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe(envBefore);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8").match(/pont:start/g)).toHaveLength(1);
  });

  it("--dry-run n'écrit aucun fichier", async () => {
    const root = nextProject();
    const result = await runInit({ cwd: root, agent: true, dryRun: true, testPayment: false, log: silent });
    expect(result.created.length).toBeGreaterThan(0);
    expect(existsSync(join(root, "lib/pont.ts"))).toBe(false);
    expect(existsSync(join(root, ".env.local"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("respecte src/ (src/app, src/lib)", async () => {
    const root = project({ "package.json": JSON.stringify({ dependencies: { next: "15" } }), "tsconfig.json": "{}", "src/app/page.tsx": "" });
    const result = await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: silent });
    expect(result.created).toContain("src/lib/pont.ts");
    expect(result.created).toContain("src/app/api/pont/hooks/[provider]/route.ts");
  });
});

describe("pont init --stores convex", () => {
  it("projet sans schéma : crée schéma, tables, fonctions, secret, et branche les stores + relais", async () => {
    const root = nextProject();
    const result = await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: silent, stores: "convex" });
    expect(result.created).toEqual(expect.arrayContaining(["convex/pontTables.ts", "convex/pontStore.ts", "convex/schema.ts"]));
    expect(result.installCommand).toBe("pnpm add @pont/node @pont/store-convex convex");
    expect(readFileSync(join(root, ".env.local"), "utf8")).toMatch(/PONT_STORE_SECRET=[0-9a-f]{64}/);
    expect(readFileSync(join(root, "lib/pont.ts"), "utf8")).toContain("createConvexStores");
    expect(readFileSync(join(root, "app/api/pont/cron/route.ts"), "utf8")).toContain("{ relay, secret");
    expect(readFileSync(join(root, "convex/pontTables.ts"), "utf8")).not.toContain("export default");
    expect(result.manualSteps).toEqual(["Convex : `npx convex env set PONT_STORE_SECRET <valeur de .env.local>`"]);
  });

  it("schéma existant : jamais modifié, étape manuelle indiquée", async () => {
    const root = nextProject();
    mkdirSync(join(root, "convex"));
    writeFileSync(join(root, "convex/schema.ts"), "export default defineSchema({ produits });\n");
    const result = await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: silent, stores: "convex" });
    expect(readFileSync(join(root, "convex/schema.ts"), "utf8")).toBe("export default defineSchema({ produits });\n");
    expect(result.manualSteps[0]).toContain("...pontTables");
  });

  it("refusé hors Next.js App Router ; option invalide → code 1", async () => {
    const express = project({ "package.json": JSON.stringify({ dependencies: { express: "4" } }) });
    expect((await runInit({ cwd: express, agent: false, dryRun: false, testPayment: false, log: silent, stores: "convex" })).created).toEqual([]);
    expect(await main(["init", "--stores", "postgres", "--no-test"], nextProject(), silent)).toBe(1);
  });
});

describe("pont init — autres stacks", () => {
  it("Express : routeur avec corps brut", async () => {
    const root = project({ "package.json": JSON.stringify({ dependencies: { express: "4" } }) });
    const result = await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: silent });
    expect(result.created).toEqual(["pont.js"]);
    expect(readFileSync(join(root, "pont.js"), "utf8")).toContain('express.raw({ type: "*/*" })');
  });

  it("Laravel : n'écrit rien et l'annonce", async () => {
    const lines: string[] = [];
    const root = project({ "composer.json": JSON.stringify({ require: { "laravel/framework": "^11.0" } }) });
    const result = await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: (l) => lines.push(l) });
    expect(result.project.stack).toBe("laravel");
    expect(result.created).toEqual([]);
    expect(lines.join("\n")).toMatch(/PHP\/Laravel arrive bientôt/);
  });
});

describe("pont doctor", () => {
  it("un projet fraîchement initialisé est sain", async () => {
    const root = nextProject();
    await runInit({ cwd: root, agent: false, dryRun: false, testPayment: false, log: silent });
    const report = runDoctor(root);
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("détecte secret côté client, paiement créé côté client, variable NEXT_PUBLIC_ secrète, statut lu dans l'URL", () => {
    const root = project({
      "package.json": JSON.stringify({ dependencies: { next: "15" } }),
      "app/api/pont/hooks/[provider]/route.ts": "export const { POST } = createWebhookRoute(pont);",
      "app/checkout/Pay.tsx": `"use client";\nconst k = process.env.FEDAPAY_SECRET_KEY;\nawait pont.createPayment({ amount }, key);`,
      "app/merci/page.tsx": `const s = searchParams.get("status"); if (s === "approved") livrer();`,
      ".env.local": "NEXT_PUBLIC_PAWAPAY_API_TOKEN=abc\n",
    });
    const codes = runDoctor(root).findings.map((f) => f.code).sort();
    expect(codes).toEqual(["payment_created_in_client", "public_secret_variable", "secret_in_client", "status_from_return_url"]);
    expect(runDoctor(root).ok).toBe(false);
  });

  it("détecte un .env suivi par git et le sandbox en live", () => {
    const root = project({
      "package.json": JSON.stringify({ dependencies: { express: "4" } }),
      "server.js": "app.use(pontRouter); handleProviderRequest(pont, p, r);",
      ".env": "PONT_MODE=live\nPONT_SANDBOX=true\nPONT_PUBLIC_URL=http://boutique.bj\nCRON_SECRET=court\n",
    });
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", ".env"], { cwd: root });
    const codes = runDoctor(root).findings.map((f) => f.code).sort();
    expect(codes).toEqual(["env_file_committed", "http_in_live", "sandbox_in_live", "weak_cron_secret"]);
  });

  it("--ci renvoie 1 en cas d'erreur", async () => {
    const root = project({ "package.json": "{}", "a.tsx": `"use client";\nprocess.env.PONT_STORE_SECRET` });
    expect(await main(["doctor", "--ci"], root, silent)).toBe(1);
    expect(await main(["doctor"], root, silent)).toBe(0);
  });
});

describe("pont trigger", () => {
  it("success : événements pending puis succeeded", async () => {
    const events = await runTrigger("success", silent);
    expect(events.map((e) => e.type)).toEqual(["payment.pending", "payment.succeeded"]);
  });

  it("insufficient_funds et ambiguous_timeout", async () => {
    expect((await runTrigger("insufficient_funds", silent)).map((e) => e.type)).toEqual(["payment.pending", "payment.failed"]);
    expect((await runTrigger("ambiguous_timeout", silent)).map((e) => e.type)).toEqual(["payment.needs_reconciliation", "payment.succeeded"]);
  });

  it("scénario inconnu → code 1", async () => {
    expect(await main(["trigger", "nimporte"], process.cwd(), silent)).toBe(1);
  });
});
