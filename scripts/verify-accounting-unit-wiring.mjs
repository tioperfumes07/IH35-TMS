#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["unit"],"leafRe":"^(bills\\.create\\.(vendor|maintenance|fuel|driver)|expenses\\.create)$","task":"LINK-F5167-ACCOUNTING-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 5 genuine accounting leaves.
 * bills.create.maintenance/fuel/driver each `Navigate` (routes/manifest.tsx) to
 * `/accounting/bills?category=<cat>&create=1`, which BillsPage.tsx resolves via
 * billTypeForCategory() into `initialBillType` fed to the SAME VendorBillForm.tsx used by
 * bills.create.vendor — a real EntityPicker kind="unit" + real unit_id resolution. expenses.create
 * (ExpenseCreatePage.tsx) renders RecordExpenseForm.tsx, which has its own real EntityPicker
 * kind="unit" + unit_id.
 *
 * Self-test: node scripts/verify-accounting-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/routes/manifest.tsx", /path="\/accounting\/bills\/maintenance"[\s\S]{0,120}to="\/accounting\/bills\?category=maintenance&create=1"/],
  ["apps/frontend/src/routes/manifest.tsx", /path="\/accounting\/bills\/fuel"[\s\S]{0,120}to="\/accounting\/bills\?category=fuel&create=1"/],
  ["apps/frontend/src/routes/manifest.tsx", /path="\/accounting\/bills\/driver"[\s\S]{0,120}to="\/accounting\/bills\?category=driver&create=1"/],
  ["apps/frontend/src/pages/accounting/BillsPage.tsx", /const createBillType = billTypeForCategory\(category\);/],
  ["apps/frontend/src/pages/accounting/BillsPage.tsx", /initialBillType=\{createBillType\}/],
  ["apps/frontend/src/components/accounting/VendorBillForm.tsx", /<EntityPicker[\s\S]{0,20}kind="unit"/],
  ["apps/frontend/src/components/expenses/RecordExpenseForm.tsx", /<EntityPicker[\s\S]{0,20}kind="unit"/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real unit-scoped bill/expense wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting's 5 unit-scoped bill/expense create leaves are real`);
