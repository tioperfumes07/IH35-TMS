#!/usr/bin/env node
/**
 * verify-step 20165 — verify-registry-json-parses
 * CC-3 Round 8.31: all json-union files must parse before commit/merge.
 * Delegates to scripts/verify-registry-json-parses.mjs.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const SELFTEST = process.argv.includes("--selftest");

const args = SELFTEST ? ["--selftest"] : [];
const r = spawnSync("node", [resolve(ROOT, "scripts/verify-registry-json-parses.mjs"), ...args], {
  cwd: ROOT,
  stdio: "inherit",
  encoding: "utf8",
});
process.exit(r.status ?? 1);
