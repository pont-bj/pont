#!/usr/bin/env tsx
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { isPontError } from "@pont-bj/core";
import { createRuntime } from "./runtime.js";

function startFailure(error: unknown): never {
  const message = isPontError(error) ? error.messageFr : error instanceof Error ? error.message : "Erreur inconnue.";
  console.error(`Pont ne démarre pas : ${message}`);
  process.exit(1);
}

let runtime: Awaited<ReturnType<typeof createRuntime>>;
try {
  runtime = await createRuntime();
} catch (error) {
  startFailure(error);
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
    const request = new Request(new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`), {
      method: incoming.method,
      headers,
      ...(hasBody ? { body: Readable.toWeb(incoming) as ReadableStream, duplex: "half" } : {}),
    } as RequestInit);
    const response = await runtime.handle(request);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    outgoing.writeHead(response.status, responseHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: { code: "internal_error", message: "Erreur interne." } }));
  }
});

let ticking = false;
const timer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await runtime.tick();
  } catch (error) {
    console.error("Tick en échec :", error instanceof Error ? error.message : "erreur inconnue");
  } finally {
    ticking = false;
  }
}, runtime.tickSeconds * 1000);

server.listen(runtime.port, () => console.log(`Pont écoute sur le port ${runtime.port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => void runtime.close().finally(() => process.exit(0)));
  });
}
