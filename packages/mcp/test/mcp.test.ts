import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { verifyPontWebhook } from "@pont/core";
import { createPontMcpServer } from "../src/index.js";

async function connect(options: Parameters<typeof createPontMcpServer>[0] = {}) {
  const server = createPontMcpServer(options);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

type Structured = Record<string, unknown>;

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return { result, data: result.structuredContent as Structured | undefined };
}

function nextProject(): string {
  const root = mkdtempSync(join(tmpdir(), "pont-mcp-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  mkdirSync(join(root, "app"));
  return root;
}

describe("serveur MCP Pont", () => {
  it("expose les 8 outils et les ressources de doc", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_test_payment", "detect_stack", "explain_error", "get_coverage", "run_doctor", "scaffold_integration", "search_docs", "simulate_webhook",
    ]);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("pont://docs/quickstart");
    expect(tools.find((t) => t.name === "run_doctor")?.annotations?.readOnlyHint).toBe(true);
  });

  it("parcours d'intégration : detect → preview → apply → doctor", async () => {
    const client = await connect();
    const root = nextProject();

    const { data: stack } = await call(client, "detect_stack", { projectDir: root });
    expect(stack).toMatchObject({ stack: "next-app", scaffoldSupported: true });

    const { data: preview } = await call(client, "scaffold_integration", { projectDir: root });
    expect(preview).toMatchObject({ applied: false });
    expect(preview?.created).toContain("lib/pont.ts");
    expect(existsSync(join(root, "lib/pont.ts"))).toBe(false);

    const { data: applied } = await call(client, "scaffold_integration", { projectDir: root, apply: true });
    expect(applied?.installCommand).toBe("npm install @pont/node");
    expect(existsSync(join(root, "lib/pont.ts"))).toBe(true);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);

    const { data: doctor } = await call(client, "run_doctor", { projectDir: root });
    expect(doctor).toMatchObject({ ok: true, findings: [] });
  });

  it("refuse un chemin relatif ou inexistant", async () => {
    const client = await connect();
    expect((await call(client, "detect_stack", { projectDir: "./projet" })).result.isError).toBe(true);
    expect((await call(client, "run_doctor", { projectDir: "/nexiste/pas" })).result.isError).toBe(true);
  });

  it("couverture : Wave Sénégal, retraits au Bénin", async () => {
    const client = await connect();
    const { data: wave } = await call(client, "get_coverage", { operator: "wave_sn" });
    const providers = (wave?.rows as Array<{ provider: string; deposit: boolean }>).filter((r) => r.deposit).map((r) => r.provider).sort();
    expect(providers).toEqual(["cinetpay", "fedapay", "pawapay", "paydunya"]);

    const { data: payouts } = await call(client, "get_coverage", { country: "BJ", capability: "payout" });
    const rows = payouts?.rows as Array<{ provider: string; operator: string }>;
    expect(rows.some((r) => r.provider === "pawapay" && r.operator === "mtn_bj")).toBe(true);
    expect(rows.some((r) => r.provider === "kkiapay")).toBe(false);
  });

  it("paiement de test : scénario timeout ambigu", async () => {
    const client = await connect();
    const { data } = await call(client, "create_test_payment", { scenario: "ambiguous_timeout" });
    expect((data?.events as Array<{ type: string }>).map((e) => e.type)).toEqual(["payment.needs_reconciliation", "payment.succeeded"]);
  });

  it("simulate_webhook : signe, envoie uniquement en local", async () => {
    const received: Array<{ body: string; signature: string | null }> = [];
    const client = await connect({
      fetch: (async (_url: string, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;
        received.push({ body: String(init?.body), signature: headers["pont-signature"] ?? null });
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    const { data } = await call(client, "simulate_webhook", { scenario: "success", secret: "whsec_test", url: "http://localhost:3000/api/webhooks/pont" });
    expect((data?.deliveries as Array<{ response: { status: number } }>).map((d) => d.response.status)).toEqual([200, 200]);
    expect(verifyPontWebhook("whsec_test", received[1]!.body, received[1]!.signature)).toBe(true);

    const remote = await call(client, "simulate_webhook", { scenario: "success", secret: "whsec_test", url: "https://exemple.com/hook" });
    expect(remote.result.isError).toBe(true);
  });

  it("explain_error et search_docs", async () => {
    const client = await connect();
    const { data } = await call(client, "explain_error", { code: "amount_mismatch" });
    expect(String(data?.fix)).toContain("Ne livrez pas");
    expect((await call(client, "explain_error", { code: "inconnu" })).result.isError).toBe(true);
    const { data: docs } = await call(client, "search_docs", { query: "numéros magiques sandbox" });
    expect((docs?.results as Array<{ id: string }>)[0]?.id).toBe("sandbox");
  });
});
