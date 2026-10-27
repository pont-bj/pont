#!/usr/bin/env node
import { main } from "./index.js";

main(process.argv.slice(2), process.cwd()).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
