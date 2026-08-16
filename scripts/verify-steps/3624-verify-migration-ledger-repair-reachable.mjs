#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(HERE, "..", "verify-migration-ledger-repair-reachable.mjs")], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
