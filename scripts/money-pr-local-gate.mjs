#!/usr/bin/env node
/**
 * money-pr-local-gate — FAIL-FAST before push (Rule 25).
 *
 * Runs the same DoD + money-theater assertions CI will run later, but in seconds
 * at husky pre-push / branch:precheck-push — so a bad FINDING / MODULE_PROGRESS
 * never burns 15–20 minutes of build-typecheck.
 *
 * Wired as the FIRST step in scripts/branch-precheck-push.mjs buildPrecheckSteps.
 * Do not remove without updating verify-money-pr-local-gate.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "money-pr-local-gate";

const STEPS = [
  ["verify-definition-of-done-evidence", "scripts/verify-definition-of-done-evidence.mjs"],
  ["verify-no-money-theater", "scripts/verify-no-money-theater.mjs"],
];

function runNode(rel) {
  const script = path.join(ROOT, rel);
  console.log(`[${LABEL}] RUN ${rel}`);
  const res = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (out) console.log(out);
  return res.status ?? 1;
}

if (process.argv.includes("--selftest")) {
  // Structural selftest only — behavioral coverage lives in verify-money-pr-local-gate.
  for (const [, rel] of STEPS) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} --selftest FAIL: missing ${rel}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

for (const [name, rel] of STEPS) {
  const code = runNode(rel);
  if (code !== 0) {
    console.error(
      `\n${LABEL}: FAIL — ${name} rejected this branch BEFORE push.\n` +
        `Fix the commit message / MODULE_PROGRESS / FINDING: ACCT-F## keys, then:\n` +
        `  node scripts/money-pr-local-gate.mjs\n` +
        `Then ONE push. Do not rebase while CI is running (Rule 25).\n`
    );
    process.exit(code);
  }
}

console.log(`${LABEL}: PASS — DoD + money-theater OK on branch range (fail-fast before CI)`);
process.exit(0);
