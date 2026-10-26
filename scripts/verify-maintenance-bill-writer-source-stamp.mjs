#!/usr/bin/env node
/**
 * ENG-15 (443.323): verify the maintenance bill writer (autoCreateBillFromWO in two-section-service.ts)
 * stamps BOTH linked_work_order_uuid AND source='work_order' on every auto-created bill.
 *
 * Also verifies the insertBillHeaderOnClient gate enforces source is present (LEAD 443.184).
 *
 * Self-test: node scripts/verify-maintenance-bill-writer-source-stamp.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-bill-writer-source-stamp";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const CHECKS = [
  {
    name: "autoCreateBillFromWO stamps source='work_order' via insertBillHeaderOnClient",
    file: "apps/backend/src/maintenance/two-section-service.ts",
    pattern: /\["source",\s*\{\s*value:\s*"work_order"\s*\}\]/,
  },
  {
    name: "autoCreateBillFromWO stamps linked_work_order_uuid from WO id",
    file: "apps/backend/src/maintenance/two-section-service.ts",
    pattern: /\["linked_work_order_uuid",\s*\{\s*value:\s*woBill\.linked_work_order_uuid/,
  },
  {
    name: "insertBillHeaderOnClient enforces source is a known BILL_SOURCE (LEAD 443.184)",
    file: "apps/backend/src/accounting/bills.service.ts",
    pattern: /if\s*\(!\s*\(BILL_SOURCES\s+as\s+readonly\s+unknown\[\]\)\.includes\(sourceValue\)\)\s*throw\s+new\s+BillSourceRequiredError/,
  },
  {
    name: "BILL_SOURCES includes 'work_order' as a valid source value",
    file: "apps/backend/src/accounting/bills.service.ts",
    pattern: /"work_order"/,
  },
  {
    name: "autoCreateBillFromWO queries linked_work_order_uuid from work order row",
    file: "apps/backend/src/maintenance/two-section-service.ts",
    pattern: /w\.id::text\s+AS\s+linked_work_order_uuid/,
  },
];

const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  const results = CHECKS.map((c) => {
    const src = read(c.file);
    return c.pattern.test(src);
  });
  const pass = results.every(Boolean);
  const failed = results.map((ok, i) => ok ? null : i + 1).filter(Boolean);
  if (!pass) {
    console.error(`${LABEL} selftest FAIL — checks ${failed.join(",")} did not match`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — all ${CHECKS.length} checks match`);
  process.exit(0);
}

const failures = [];
for (const check of CHECKS) {
  const src = read(check.file);
  if (!check.pattern.test(src)) {
    failures.push(`FAIL: ${check.name} (${check.file})`);
  }
}

if (failures.length) {
  for (const f of failures) console.error(f);
  console.error(`[${LABEL}] FAIL — ${failures.length} check(s) failed`);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — autoCreateBillFromWO stamps source='work_order' + linked_work_order_uuid; insertBillHeaderOnClient enforces source is required`);
