#!/usr/bin/env node
/**
 * CI guard — AUDIT-COVERAGE-LIVE Module ids + Scoreboard must match recomputed metrics.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/audit-coverage-scoreboard.mjs");
const LABEL = "verify-audit-coverage-scoreboard";

const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { cwd: ROOT, encoding: "utf8" });
if (self.status !== 0) {
  console.error(`${LABEL}: --selftest FAIL\n${self.stdout}${self.stderr}`);
  process.exit(1);
}

const check = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8" });
if (check.status !== 0) {
  console.error(`${LABEL}: FAIL\n${check.stdout}${check.stderr}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS\n${check.stdout.trim()}`);
