#!/usr/bin/env node
/**
 * Law §9 / RULE 16 guard: WO auto bill/expense paths must stamp unit_id (and preserve vendor)
 * when creating accounting.bills / accounting.expenses.
 *
 * Audit: docs/trackers/LAW-E2E-MAINTENANCE-WO-BILL-LINKAGE-2026-07-21.md (PR #3176 P0 #4)
 *
 * Targets:
 *   - autoCreateBillFromWO / autoCreateExpenseFromWO (two-section-service)
 *   - getOrCreateBillForWorkOrder (maintenance-posting/poster.service)
 *
 * Run: node scripts/verify-wo-auto-bill-expense-stamps-unit-id.mjs [--selftest]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TWO_SECTION = "apps/backend/src/maintenance/two-section-service.ts";
const POSTER = "apps/backend/src/accounting/maintenance-posting/poster.service.ts";

function extractFunction(src, name) {
  const exportStart = src.indexOf(`export async function ${name}`);
  const plainStart = src.indexOf(`async function ${name}`);
  let start = -1;
  if (exportStart >= 0 && (plainStart < 0 || exportStart <= plainStart)) start = exportStart;
  else if (plainStart >= 0) start = plainStart;
  if (start < 0) return null;

  // Find the NEXT top-level async function after this one (export or not), and slice between.
  // Avoid brace-matching: TypeScript param types like `opts?: { ... }` fool naive braces.
  const afterSig = src.indexOf("\n", start);
  const rest = src.slice(afterSig + 1);
  const nextExport = rest.search(/\nexport async function \w+/);
  const nextPlain = rest.search(/\nasync function \w+/);
  const candidates = [nextExport, nextPlain].filter((n) => n >= 0);
  const nextRel = candidates.length ? Math.min(...candidates) : -1;
  if (nextRel < 0) return src.slice(start);
  return src.slice(start, afterSig + 1 + nextRel);
}

function assertBillInsertStampsUnit(fnSrc, label, failures) {
  if (!fnSrc) {
    failures.push(`${label}: function not found`);
    return;
  }
  const insertIdx = fnSrc.search(/INSERT\s+INTO\s+accounting\.bills\b/i);
  if (insertIdx < 0) {
    failures.push(`${label}: missing INSERT INTO accounting.bills`);
    return;
  }
  // Take from INSERT through RETURNING / next statement (~2kb is enough for these inserts).
  const insertBlock = fnSrc.slice(insertIdx, insertIdx + 2500);
  if (!/\bunit_id\b/i.test(insertBlock)) {
    failures.push(`${label}: bills INSERT must include unit_id column`);
  }
  // Vendor must still be written (COALESCE external/vendor or vendor_id/vendor_uuid params).
  if (!/vendor_uuid|vendor_id|COALESCE\s*\(\s*w\.external_vendor_id/i.test(insertBlock)) {
    failures.push(`${label}: bills INSERT must preserve vendor (vendor_uuid / vendor_id / COALESCE)`);
  }
}

function assertExpenseInsertStampsUnit(fnSrc, label, failures) {
  if (!fnSrc) {
    failures.push(`${label}: function not found`);
    return;
  }
  // Prefer the branch that includes unit_id (columnExists-gated).
  const unitInsert = /INSERT\s+INTO\s+accounting\.expenses\s*\([^)]*\bunit_id\b[^)]*\)/is;
  if (!unitInsert.test(fnSrc)) {
    failures.push(`${label}: expenses INSERT must include a unit_id branch`);
  }
  if (!/\bvendor_uuid\b/i.test(fnSrc)) {
    failures.push(`${label}: expenses INSERT must preserve vendor_uuid`);
  }
  // Must read unit_id from the WO context SELECT.
  if (!/w\.unit_id/i.test(fnSrc) && !/\bunit_id\b.*FROM\s+maintenance\.work_orders/is.test(fnSrc)) {
    failures.push(`${label}: must SELECT unit_id from maintenance.work_orders`);
  }
}

function selftest() {
  const failures = [];
  const goodBill = `
export async function autoCreateBillFromWO() {
  await client.query(\`
    INSERT INTO accounting.bills (
      operating_company_id, vendor_uuid, linked_work_order_uuid, unit_id, status
    )
    SELECT w.operating_company_id, COALESCE(w.external_vendor_id, w.vendor_id), w.id, w.unit_id, 'draft'
    FROM maintenance.work_orders w
  \`);
}`;
  const badBill = `
export async function autoCreateBillFromWO() {
  await client.query(\`
    INSERT INTO accounting.bills (
      operating_company_id, vendor_uuid, linked_work_order_uuid, status
    )
    SELECT w.operating_company_id, COALESCE(w.external_vendor_id, w.vendor_id), w.id, 'draft'
    FROM maintenance.work_orders w
  \`);
}`;
  const goodExpense = `
export async function autoCreateExpenseFromWO() {
  const wo = await client.query(\`SELECT w.unit_id::text AS unit_id, COALESCE(w.external_vendor_id, w.vendor_id) AS vendor_uuid FROM maintenance.work_orders w\`);
  await client.query(\`
    INSERT INTO accounting.expenses (
      operating_company_id, vendor_uuid, linked_work_order_uuid, unit_id, status, transaction_date, total_amount, payment_account_uuid
    ) VALUES ($1, $2, $3, $4, 'posted', CURRENT_DATE, $5, $6)
  \`);
}`;
  const f1 = [];
  assertBillInsertStampsUnit(extractFunction(goodBill, "autoCreateBillFromWO"), "goodBill", f1);
  if (f1.length) failures.push("goodBill should PASS: " + f1.join("; "));
  const f2 = [];
  assertBillInsertStampsUnit(extractFunction(badBill, "autoCreateBillFromWO"), "badBill", f2);
  if (f2.length === 0) failures.push("badBill should FAIL for missing unit_id");
  const f3 = [];
  assertExpenseInsertStampsUnit(extractFunction(goodExpense, "autoCreateExpenseFromWO"), "goodExpense", f3);
  if (f3.length) failures.push("goodExpense should PASS: " + f3.join("; "));

  if (failures.length) {
    console.error("verify-wo-auto-bill-expense-stamps-unit-id SELFTEST FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("verify-wo-auto-bill-expense-stamps-unit-id selftest passed");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const failures = [];
  const twoSectionPath = path.join(ROOT, TWO_SECTION);
  const posterPath = path.join(ROOT, POSTER);
  if (!fs.existsSync(twoSectionPath)) failures.push(`missing ${TWO_SECTION}`);
  if (!fs.existsSync(posterPath)) failures.push(`missing ${POSTER}`);
  if (failures.length) {
    console.error("verify-wo-auto-bill-expense-stamps-unit-id FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }

  const twoSection = fs.readFileSync(twoSectionPath, "utf8");
  const poster = fs.readFileSync(posterPath, "utf8");

  assertBillInsertStampsUnit(extractFunction(twoSection, "autoCreateBillFromWO"), "autoCreateBillFromWO", failures);
  assertExpenseInsertStampsUnit(extractFunction(twoSection, "autoCreateExpenseFromWO"), "autoCreateExpenseFromWO", failures);
  assertBillInsertStampsUnit(extractFunction(poster, "getOrCreateBillForWorkOrder"), "getOrCreateBillForWorkOrder", failures);

  if (failures.length) {
    console.error(
      "verify-wo-auto-bill-expense-stamps-unit-id FAILED: WO auto bill/expense must stamp unit_id\n" +
        "(Law §9 — repair money links unit + vendor + WO):\n"
    );
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("verify-wo-auto-bill-expense-stamps-unit-id PASS");
}

main();
