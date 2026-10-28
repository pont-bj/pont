import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importOpenApi, parseProviderSpec, runProviderImport } from "../src/index.js";

const openapi = {
  openapi: "3.0.3",
  info: { title: "Mon Agrégateur" },
  servers: [
    { url: "https://api.mon.example/v1", description: "Production" },
    { url: "https://sandbox.mon.example/v1", description: "Sandbox" },
  ],
  components: {
    securitySchemes: { key: { type: "http", scheme: "bearer" } },
    schemas: {
      Payment: {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["PENDING", "SUCCESS", "FAILED", "ACCEPTED"] },
              amount: { type: "integer" },
              currency: { type: "string", enum: ["XOF"] },
              merchant_reference: { type: "string" },
            },
          },
        },
      },
    },
  },
  paths: {
    "/payments": {
      post: {
        operationId: "createPayment",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amount", "msisdn", "merchant_reference", "channel_code", "tax_id"],
                properties: {
                  amount: { type: "integer" },
                  currency: { type: "string" },
                  msisdn: { type: "string" },
                  merchant_reference: { type: "string" },
                  callback_url: { type: "string" },
                  channel_code: { type: "string" },
                  tax_id: { type: "string" },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } } },
      },
    },
    "/payments/{id}": {
      get: {
        operationId: "getPayment",
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } } },
      },
    },
  },
};

describe("pont provider import — OpenAPI", () => {
  const { draft, report } = importOpenApi(structuredClone(openapi));

  it("reprend les noms exacts de la spécification", () => {
    expect(draft["id"]).toBe("mon_agregateur");
    expect(draft["baseUrl"]).toEqual({ test: "https://sandbox.mon.example/v1", live: "https://api.mon.example/v1" });
    expect(draft["auth"]).toEqual({ type: "bearer", key: "secretKey" });
    const deposit = draft["deposit"] as { path: string; body: Record<string, string>; response: { providerRef: string } };
    expect(deposit.body["msisdn"]).toBe("{phone}");
    expect(deposit.body["merchant_reference"]).toBe("{attemptId}");
    expect(deposit.body["callback_url"]).toBe("{callbackUrl}");
    expect(deposit.response.providerRef).toBe("data.id");
    expect(draft["verify"]).toMatchObject({ method: "GET", path: "/payments/{providerRef}", response: { status: "data.status", amount: "data.amount", attemptRef: "data.merchant_reference" } });
  });

  it("ne devine pas les statuts ambigus : ACCEPTED reste hors table", () => {
    expect(draft["statusMap"]).toEqual({ PENDING: "pending", SUCCESS: "succeeded", FAILED: "failed" });
    expect(report.review.join("\n")).toMatch(/ACCEPTED/);
  });

  it("signale ce qui manque, et le brouillon est refusé tant qu'il n'est pas complété", () => {
    expect(report.missing.join("\n")).toMatch(/tax_id/);
    expect(report.missing.join("\n")).toMatch(/Webhook/);
    const checked = parseProviderSpec(draft);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors.join("\n")).toMatch(/À compléter|webhook/);
  });

  it("refuse Swagger 2 et les documents non OpenAPI", () => {
    expect(() => importOpenApi({ swagger: "2.0" })).toThrow(/Swagger 2/);
    expect(() => importOpenApi({ hello: 1 })).toThrow(/OpenAPI 3/);
  });

  it("écrit le brouillon depuis un fichier YAML, et refuse http://", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pont-import-"));
    const yaml = "openapi: 3.0.0\ninfo:\n  title: Yaml Pay\npaths: {}\n";
    writeFileSync(join(dir, "spec.yaml"), yaml);
    const lines: string[] = [];
    const ok = await runProviderImport({ cwd: dir, source: "spec.yaml", force: false, log: (l) => lines.push(l) });
    expect(ok.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "yaml_pay.draft.json"), "utf8")).id).toBe("yaml_pay");
    const refused = await runProviderImport({ cwd: dir, source: "http://exemple.test/openapi.json", force: false, log: () => {} });
    expect(refused.ok).toBe(false);
    const again = await runProviderImport({ cwd: dir, source: "spec.yaml", force: false, log: () => {} });
    expect(again.errors.join()).toMatch(/existe déjà/);
  });
});
