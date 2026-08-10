#!/usr/bin/env node
/**
 * FACT-UNIT-01 — Banking factor virtual register must expose factoring advance amounts
 * in dollars (cents/100), not raw cents, so the UI register does not display 100x values.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/backend/src/banking/banking.routes.ts";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  if (!exists(FILE)) {
    failures.push(`MISSING: ${FILE}`);
    return failures;
  }
  const src = read(FILE);

  // Locate the factoring-advance amount expression and assert it is scaled to dollars.
  const amountMatch = src.match(
    /([\s\S]{0,300}advance_amount_cents[\s\S]{0,500})/
  );
  if (!amountMatch) {
    failures.push(`${FILE}: could not locate advance_amount_cents in the register SQL`);
    return failures;
  }
  const block = amountMatch[0];

  if (!/'virtual_factoring'/.test(block)) {
    failures.push(`${FILE}: advance_amount_cents amount must belong to the virtual_factoring register branch`);
  }

  if (!/\(\s*fa\.advance_amount_cents::numeric\s*\/\s*100\s*\)\s+AS\s+amount/.test(block)) {
    failures.push(`${FILE}: expected '(fa.advance_amount_cents::numeric / 100) AS amount' in virtual_factoring branch`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace(/\(\s*fa\.advance_amount_cents::numeric\s*\/\s*100\s*\)/g, "fa.advance_amount_cents"), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-fact-unit-01-banking-factor-register-scale] SELFTEST FAIL: planted raw-cents amount did not fail");
        process.exit(1);
      }
      console.log(`[verify-fact-unit-01-banking-factor-register-scale] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-fact-unit-01-banking-factor-register-scale] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-fact-unit-01-banking-factor-register-scale] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
