#!/usr/bin/env node
/**
 * 18437 — 9c: verify no QBO mirror table reads in money paths
 *
 * Guards the files changed in 443.138 to ensure none of the target
 * money-path files read from QBO mirror tables directly:
 *   mdata.qbo_vendors  mdata.qbo_customers  mdata.qbo_accounts  mdata.qbo_items
 *
 * Self-test: --selftest mutates a temp file with a mirror read and asserts the
 * guard catches it, then restores the file.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

const QBO_MIRROR_PATTERN = /FROM\s+(mdata\.(qbo_vendors|qbo_customers|qbo_accounts|qbo_items))/i;
const QBO_JOIN_PATTERN = /JOIN\s+(mdata\.(qbo_vendors|qbo_customers|qbo_accounts|qbo_items))/i;

const TARGET_FILES = [
  "apps/backend/src/work-orders/work-orders.routes.ts",
  "apps/backend/src/mdata/accounts.routes.ts",
  "apps/backend/src/mdata/items.routes.ts",
  "apps/backend/src/accounting/qbo-master-read.routes.ts",
  "apps/backend/src/lists/names-master.routes.ts",
  "apps/backend/src/cash-advances/cash-advances.routes.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-f-supporting-docs.ts",
  "apps/backend/src/accounting/pse-mirror.service.ts",
];

function check(files) {
  const findings = [];
  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      findings.push(`MISSING: ${rel}`);
      continue;
    }
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (QBO_MIRROR_PATTERN.test(ln) || QBO_JOIN_PATTERN.test(ln)) {
        findings.push(`${rel}:${i + 1}: QBO mirror read — ${ln.trim()}`);
      }
    }
  }
  return findings;
}

if (process.argv.includes("--selftest")) {
  const probe = resolve(ROOT, TARGET_FILES[0]);
  const original = readFileSync(probe, "utf8");
  const mutated = original + "\n// SELFTEST_PROBE SELECT 1 FROM mdata.qbo_vendors WHERE id = $1\n";
  writeFileSync(probe, mutated);
  const findings = check(TARGET_FILES);
  writeFileSync(probe, original);
  if (findings.length === 0) {
    console.error("SELFTEST FAIL: guard did not catch injected mirror read");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: caught ${findings.length} finding(s)`);
  process.exit(0);
}

const findings = check(TARGET_FILES);
if (findings.length > 0) {
  console.error(`18437 FAIL: QBO mirror reads found in money paths (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("18437 PASS: no QBO mirror table reads in money paths");
process.exit(0);
