#!/usr/bin/env node
// verify-expenses-projection-opco-lines — Cursor band 1738.
//
// FINDING (prod 2026-07-29, post-#3733): QBO_EXPENSES_PROJECTION_ENABLED was correctly ON for
// TRANSP; mdata.qbo_purchases had 28,047 rows; accounting.expenses stayed 0. The stage WAS running
// (qbo.sync_runs kind qbo_purchases_inbound_mirror succeeded at 01:00Z — look there, NOT
// mdata.qbo_sync_runs which is CoA/customer/vendor CDC only). Stage-2 projectPurchasesToExpenses
// failed every tick because accounting.expense_lines.operating_company_id is NOT NULL with no
// default, and both set-based line INSERTs omitted it — Postgres rejected the line write and the
// deferred header/line balance trigger rolled the WHOLE projection txn (headers included) back to 0.
//
// Do NOT flip the projection flag off to "fix" this. The flag is correct; the INSERT shape was not.
//
// Asserts: every INSERT INTO accounting.expense_lines inside projectPurchasesToExpenses includes
// operating_company_id; projection writes qbo.sync_runs kind qbo_purchases_expenses_projection.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PULLER = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-purchases-puller.ts");
const KIND = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-purchases-sync-kind.ts");
const BACKFILL = path.join(ROOT, "scripts/ops/backfill-qbo-purchases-expenses.mjs");

function analyzeExpenseLineInserts(src, label, { requireProjectFn = false } = {}) {
  const failures = [];
  const fnIdx = src.indexOf("export async function projectPurchasesToExpenses");
  if (requireProjectFn && fnIdx < 0) {
    failures.push(`${label}: missing export async function projectPurchasesToExpenses`);
    return failures;
  }
  const body = fnIdx >= 0 ? src.slice(fnIdx) : src;
  const inserts = body.match(/INSERT\s+INTO\s+accounting\.expense_lines\s*\(([^)]+)\)/gi) ?? [];
  if (inserts.length === 0) {
    failures.push(`${label}: no INSERT INTO accounting.expense_lines — projection cannot write lines.`);
    return failures;
  }
  for (const ins of inserts) {
    if (!/\boperating_company_id\b/i.test(ins)) {
      failures.push(
        `${label}: expense_lines INSERT missing operating_company_id — NOT NULL/no-default; omission ` +
          `rolls the whole projection txn back to expenses=0 (prod 2026-07-29 defect).`
      );
    }
  }
  return failures;
}

function analyze() {
  const failures = [];
  if (!fs.existsSync(PULLER)) {
    failures.push(`missing ${PULLER}`);
    return failures;
  }
  const puller = fs.readFileSync(PULLER, "utf8");
  failures.push(...analyzeExpenseLineInserts(puller, "qbo-purchases-puller.ts", { requireProjectFn: true }));
  if (!/QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND/.test(puller)) {
    failures.push(
      "projectPurchasesToExpenses must write qbo.sync_runs via QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND " +
        "(so stage-2 is visible — mdata.qbo_sync_runs will never show purchases)."
    );
  }
  if (fs.existsSync(KIND)) {
    const kindSrc = fs.readFileSync(KIND, "utf8");
    if (!/qbo_purchases_expenses_projection/.test(kindSrc)) {
      failures.push("qbo-purchases-sync-kind.ts missing qbo_purchases_expenses_projection kind constant.");
    }
  }
  if (fs.existsSync(BACKFILL)) {
    failures.push(
      ...analyzeExpenseLineInserts(fs.readFileSync(BACKFILL, "utf8"), "backfill-qbo-purchases-expenses.mjs")
    );
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `export async function projectPurchasesToExpenses() {
    INSERT INTO accounting.expense_lines (operating_company_id, expense_id) SELECT ...
  }
  QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND`;
  const bad = `export async function projectPurchasesToExpenses() {
    INSERT INTO accounting.expense_lines (expense_id, line_sequence) SELECT ...
  }`;
  const goodFails = analyzeExpenseLineInserts(good, "good").length;
  const badFails = analyzeExpenseLineInserts(bad, "bad").length;
  if (goodFails === 0 && badFails > 0) {
    console.log("verify-expenses-projection-opco-lines --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-expenses-projection-opco-lines --selftest: FAIL", { goodFails, badFails });
  process.exit(1);
}

const failures = analyze();
if (failures.length) {
  console.error("FAIL verify-expenses-projection-opco-lines:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "PASS verify-expenses-projection-opco-lines — expense_lines INSERTs stamp operating_company_id; " +
    "stage-2 sync kind qbo_purchases_expenses_projection present."
);
