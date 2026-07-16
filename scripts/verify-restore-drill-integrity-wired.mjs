#!/usr/bin/env node
/**
 * B-D3 CI guard — restore-drill data-integrity assertion must stay wired into the drill.
 * Structural + --selftest of the assertion evaluator (no prod DB).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-restore-drill-integrity-wired";

const REQUIRED = [
  "scripts/restore-drill-integrity.mjs",
  "scripts/backup-restore-drill.sh",
  ".github/workflows/monthly-restore-drill.yml",
];

const errs = [];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) errs.push(`missing ${rel}`);
}

const sh = fs.readFileSync(path.join(ROOT, "scripts/backup-restore-drill.sh"), "utf8");
if (!/restore-drill-integrity\.mjs/.test(sh)) {
  errs.push("backup-restore-drill.sh must invoke restore-drill-integrity.mjs");
}
if (!/run_integrity_check|integrity-check/.test(sh)) {
  errs.push("backup-restore-drill.sh must define/run an integrity-check step");
}

const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/monthly-restore-drill.yml"), "utf8");
if (!/restore-drill-integrity\.mjs/.test(yml)) {
  errs.push("monthly-restore-drill.yml must run restore-drill-integrity.mjs");
}

const integrity = fs.readFileSync(path.join(ROOT, "scripts/restore-drill-integrity.mjs"), "utf8");
for (const needle of [
  "evaluateIntegritySnapshot",
  "check_key",
  "restore_drill",
  "verify-balanced-ledger",
  "--selftest",
]) {
  if (!integrity.includes(needle)) errs.push(`restore-drill-integrity.mjs must include ${needle}`);
}

if (errs.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const self = spawnSync(process.execPath, [path.join(ROOT, "scripts/restore-drill-integrity.mjs"), "--selftest"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (self.status !== 0) {
  console.error(`[${LABEL}] FAIL — --selftest exited ${self.status}`);
  if (self.stdout) console.error(self.stdout);
  if (self.stderr) console.error(self.stderr);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — integrity assertion wired + selftest green`);
process.exit(0);
