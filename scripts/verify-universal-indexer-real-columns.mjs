#!/usr/bin/env node
/**
 * SRCH-F64 — the universal search indexer must select columns that EXIST, and must never index a
 * government identifier.
 *
 * WHY THIS EXISTS (verified on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * search/universal/indexer.service.ts selected `COALESCE(d.driver_code, '')` from mdata.drivers.
 * There is no driver_code column — the real display identifier is employee_id_display. The statement
 * therefore failed at PARSE time and `_system.background_jobs` showed search.indexer_incremental with
 * last_successful_run_at = NULL: universal search has NEVER indexed a driver. 90 active drivers
 * (181 rows total; deactivated retained under void-not-delete) were unsearchable.
 *
 * THE SECOND ASSERTION IS THE ONE THAT MATTERS LONGER-TERM. mdata.drivers really does carry
 * cdl_number, visa_number, passport_number, ine_number, b1_visa_number, mexican_license_number,
 * fast_card_number and twic_card_number. Any of those would have "fixed" the parse error just as
 * well, and the obvious guess when someone sees a missing driver_code is to reach for cdl_number.
 * That would publish government ID numbers into an index every authorised user can query, and the
 * drivers here are Mexican B1 contractors whose visa and passport numbers are exactly the data that
 * must not spread. This guard fails on any of them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/search/universal/indexer.service.ts";
const LABEL = "verify-universal-indexer-real-columns";

/** Columns that do NOT exist on mdata.drivers (prod-verified) — selecting one is a parse-time failure. */
const PHANTOM_DRIVER_COLUMNS = ["driver_code", "full_name", "driver_number", "employee_code"];

/** Real columns that must never reach a universal search index. */
const SENSITIVE_DRIVER_COLUMNS = [
  "cdl_number",
  "visa_number",
  "passport_number",
  "ine_number",
  "b1_visa_number",
  "mexican_license_number",
  "fast_card_number",
  "twic_card_number",
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

export function auditIndexer(src) {
  const code = stripComments(src);
  const problems = [];
  for (const col of PHANTOM_DRIVER_COLUMNS) {
    if (new RegExp(`\\bd?\\.?${col}\\b`).test(code)) {
      problems.push(
        `${SVC}: selects mdata.drivers.${col}, which does not exist on prod. The statement fails at ` +
          `PARSE time, so the indexer never runs and universal search silently indexes nothing.`
      );
    }
  }
  for (const col of SENSITIVE_DRIVER_COLUMNS) {
    if (new RegExp(`\\b${col}\\b`).test(code)) {
      problems.push(
        `${SVC}: indexes mdata.drivers.${col}. Government identifiers must never enter the universal ` +
          `search index — these drivers are Mexican B1 contractors and their visa/passport/CDL numbers ` +
          `are precisely the data that must not spread. Use employee_id_display.`
      );
    }
  }
  return problems;
}

function auditTree() {
  return auditIndexer(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  if (auditIndexer("COALESCE(d.driver_code, '') AS secondary_text").length === 0)
    failures.push("case1 FAIL — the phantom driver_code was NOT caught");
  if (auditIndexer("COALESCE(d.employee_id_display, '') AS secondary_text").length !== 0)
    failures.push("case2 FAIL — the correct employee_id_display was flagged");
  if (!auditIndexer("COALESCE(d.cdl_number, '') AS secondary_text").some((p) => p.includes("Government identifiers")))
    failures.push("case3 FAIL — indexing cdl_number was NOT caught");
  if (!auditIndexer("COALESCE(d.passport_number, '') AS secondary_text").some((p) => p.includes("Government identifiers")))
    failures.push("case4 FAIL — indexing passport_number was NOT caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — phantom column caught, correct column clean, CDL and passport indexing caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the driver indexer selects real columns and no government identifier`);
}

main();
