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

if (process.argv.includes("--selftest")) {
  // REAL selftest: the clean tree must pass, and for EACH check a copy of its source with the matched code removed
  // (in memory — the tracked file is never written) must make that check fail. The old arm only re-ran the check
  // on the real file, so it could never fail.
  const problems = [];
  CHECKS.forEach((c, i) => {
    const src = read(c.file);
    if (!c.pattern.test(src)) problems.push(`clean tree: check ${i + 1} (${c.name}) does not match`);
    const g = new RegExp(c.pattern.source, c.pattern.flags.includes("g") ? c.pattern.flags : c.pattern.flags + "g");
    const planted = src.replace(g, "/* planted: removed */");
    if (planted === src) problems.push(`plant ${i + 1} changed nothing`);
    else if (c.pattern.test(planted)) problems.push(`plant ${i + 1} (${c.name}) escaped`);
  });
  if (problems.length) {
    console.error(`${LABEL} selftest FAIL:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — clean tree passes; ${CHECKS.length}/${CHECKS.length} planted removals caught`);
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
