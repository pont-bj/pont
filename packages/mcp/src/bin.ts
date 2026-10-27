#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPontMcpServer } from "./server.js";

// stdout est réservé au protocole MCP : les journaux vont sur stderr.
const server = createPontMcpServer();
await server.connect(new StdioServerTransport());
console.error("pont-mcp prêt (stdio, sandbox uniquement)");
