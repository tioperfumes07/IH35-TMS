#!/usr/bin/env node
/**
 * Static guard (compat): from-load refuses $0; unsent invoices re-sync via shared helper.
 * Delegates assertions to verify-from-load-invoice-no-zero-rate (canonical).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/verify-from-load-invoice-no-zero-rate.mjs")], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
