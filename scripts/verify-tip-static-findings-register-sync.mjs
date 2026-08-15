#!/usr/bin/env node
/**
 * Tip-static unblock — findings register completeness (claimed step 3336→3338).
 *
 * Ensures docs/audit/CC-3-FINDINGS-CHECKLIST.md stays in sync with OPEN board ids
 * (verify-findings-register-signoff). This wrapper exists so the CLAIMED EVEN step
 * 3338 has a named author script; the authority remains the existing signoff guard.
 *
 * Run: node scripts/verify-tip-static-findings-register-sync.mjs [--selftest]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tip-static-findings-register-sync";
const TARGET = path.join(ROOT, "scripts/verify-findings-register-signoff.mjs");

function run(args) {
  const res = spawnSync(process.execPath, [TARGET, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  return res.status ?? 1;
}

if (process.argv.includes("--selftest")) {
  const code = run(["--selftest"]);
  if (code !== 0) {
    console.error(`${LABEL} --selftest FAILED (delegated signoff selftest)`);
    process.exit(code);
  }
  console.log(`${LABEL} --selftest OK (delegates to verify-findings-register-signoff)`);
  process.exit(0);
}

const code = run([]);
if (code !== 0) process.exit(code);
console.log(`${LABEL} PASS — findings register signoff green`);
process.exit(0);
