#!/usr/bin/env node
/**
 * ENG-34 wire — ROUND 8.4 UI-F11125 design-parity census ratchet.
 * Runner: node scripts/verify-design-parity-census.mjs [--selftest]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/verify-design-parity-census.mjs");
const mode = process.argv.includes("--selftest") ? "--selftest" : "";
const r = spawnSync(process.execPath, [SCRIPT, mode].filter(Boolean), {
  cwd: ROOT,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
