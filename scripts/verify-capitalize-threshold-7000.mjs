#!/usr/bin/env node
/**
 * ND-FA-01 / A4-D6 — pin the owner-locked $7,000 capitalize-vs-expense threshold.
 *
 *   node scripts/verify-capitalize-threshold-7000.mjs
 *   node scripts/verify-capitalize-threshold-7000.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-capitalize-threshold-7000";
const SRC = "apps/backend/src/accounting/capitalize-threshold.ts";

function read() {
  return fs.readFileSync(path.join(ROOT, SRC), "utf8");
}

function contractErrors(src) {
  const errors = [];
  if (!/CAPITALIZE_REPAIR_THRESHOLD_CENTS\s*=\s*700_000/.test(src) && !/CAPITALIZE_REPAIR_THRESHOLD_CENTS\s*=\s*700000/.test(src)) {
    errors.push("must export CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000 ($7,000)");
  }
  if (!/decideRepairBooksTreatment/.test(src)) {
    errors.push("must export decideRepairBooksTreatment");
  }
  if (!/amountCents\s*>=\s*CAPITALIZE_REPAIR_THRESHOLD_CENTS/.test(src)) {
    errors.push("decideRepairBooksTreatment must capitalize at-or-above threshold ( >= )");
  }
  if (!/"capitalize"/.test(src) || !/"expense"/.test(src)) {
    errors.push("must return capitalize | expense");
  }
  if (!/A4-D6/.test(src) && !/\$7,000/.test(src)) {
    errors.push("must cite owner lock A4-D6 / $7,000 in source comment");
  }
  if (!/HEAVY_REPAIR_EXPENSE_COA_ROLE\s*=\s*"heavy_repair_expense"/.test(src)) {
    errors.push('must export HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense" (A4-D2)');
  }
  if (!/A4-D2/.test(src)) {
    errors.push("must cite owner lock A4-D2 Heavy Repair Expense");
  }
  return errors;
}

function selftest() {
  const good = [
    "export const CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000;",
    'export const HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense" as const;',
    'export function decideRepairBooksTreatment(amountCents: number) {',
    "  return amountCents >= CAPITALIZE_REPAIR_THRESHOLD_CENTS ? \"capitalize\" : \"expense\";",
    "}",
    "// A4-D6 — $7,000",
    "// A4-D2 — Heavy Repair Expense",
  ].join("\n");
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const wrong = good.replace("700_000", "500_000");
  if (!contractErrors(wrong).some((e) => e.includes("700_000"))) {
    console.error(`${LABEL} --selftest FAIL wrong threshold not caught`);
    process.exit(1);
  }
  const lt = good.replace(">=", ">");
  if (!contractErrors(lt).some((e) => e.includes(">="))) {
    console.error(`${LABEL} --selftest FAIL exclusive bound not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, SRC))) {
  console.error(`${LABEL}: FAIL — missing ${SRC}`);
  process.exit(1);
}
const errors = contractErrors(read());
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — capitalize threshold locked at $7,000 (700_000¢)`);
process.exit(0);
