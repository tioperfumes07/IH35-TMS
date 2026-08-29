#!/usr/bin/env node
/**
 * verify-maintenance-warranty-parts-business-dates.mjs (MAINT-MONEY-F6956 + F6971)
 *
 * Warranty expiry/eligibility checks, warranty part purchase defaults, warranty-reimbursement GL
 * posting dates, and parts-purchase GL posting dates all derived "today" from
 * `new Date().toISOString().slice(0, 10)` -- UTC's calendar date. After ~19:00 Central this can
 * mark warranty eligibility against tomorrow (a part warrantied yesterday reads as still-covered or
 * already-expired a day early/late) and, worse, POST maintenance economics (warranty reimbursement,
 * parts purchase) on the wrong business date -- the same UTC-vs-company-timezone bug class this
 * session already fixed twice in frontend files (DRV-MONEY-F6959, CUST-MONEY-F6964), here on the
 * backend GL-posting side. MAINT-MONEY-F6971 (GO-0027) extends this same guard to
 * work-orders.routes.ts's WO-void reversal-date fallback, the one call site of the same class left
 * in that file when F6971 was originally filed.
 *
 * The fix replaces every site with the canonical companyBusinessDate() (lib/company-business-date.ts,
 * the same helper severe-repair-pdf-export.ts in this same directory already uses).
 *
 * This guard asserts, against the REAL files:
 *   1. warranty.routes.ts has zero remaining `new Date().toISOString().slice(0, 10)` occurrences
 *      and imports companyBusinessDate.
 *   2. parts-inventory.routes.ts has zero remaining occurrences and imports companyBusinessDate.
 *   3. work-orders/work-orders.routes.ts's WO-void reversal-date fallback (`today`) uses
 *      companyBusinessDate() and imports it.
 *
 * FAIL if any file regresses to the raw-UTC pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-warranty-parts-business-dates";
const WARRANTY_FILE = "apps/backend/src/maintenance/warranty.routes.ts";
const PARTS_FILE = "apps/backend/src/maintenance/parts-inventory.routes.ts";
const WO_FILE = "apps/backend/src/work-orders/work-orders.routes.ts";
const BAD_PATTERN = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/;

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `sources` to exercise this exact function against synthetic content;
 * omit it to check the real repo files.
 */
export function check(sources) {
  const failures = [];

  const warrantySrc = sources ? sources.warranty : (() => { try { return readReal(WARRANTY_FILE); } catch { return null; } })();
  const partsSrc = sources ? sources.parts : (() => { try { return readReal(PARTS_FILE); } catch { return null; } })();
  const woSrc = sources ? sources.wo : (() => { try { return readReal(WO_FILE); } catch { return null; } })();
  if (warrantySrc == null) return [`${WARRANTY_FILE} not found`];
  if (partsSrc == null) return [`${PARTS_FILE} not found`];
  if (woSrc == null) return [`${WO_FILE} not found`];

  if (BAD_PATTERN.test(warrantySrc)) {
    const count = (warrantySrc.match(new RegExp(BAD_PATTERN, "g")) ?? []).length;
    failures.push(`${WARRANTY_FILE}: ${count} occurrence(s) of the raw UTC date pattern still present`);
  }
  if (!/import\s*\{\s*companyBusinessDate\s*\}\s*from\s*"\.\.\/lib\/company-business-date\.js"/.test(warrantySrc)) {
    failures.push(`${WARRANTY_FILE}: no longer imports companyBusinessDate`);
  }

  if (BAD_PATTERN.test(partsSrc)) {
    const count = (partsSrc.match(new RegExp(BAD_PATTERN, "g")) ?? []).length;
    failures.push(`${PARTS_FILE}: ${count} occurrence(s) of the raw UTC date pattern still present`);
  }
  if (!/import\s*\{\s*companyBusinessDate\s*\}\s*from\s*"\.\.\/lib\/company-business-date\.js"/.test(partsSrc)) {
    failures.push(`${PARTS_FILE}: no longer imports companyBusinessDate`);
  }

  if (BAD_PATTERN.test(woSrc)) {
    const count = (woSrc.match(new RegExp(BAD_PATTERN, "g")) ?? []).length;
    failures.push(`${WO_FILE}: ${count} occurrence(s) of the raw UTC date pattern still present`);
  }
  if (!/import\s*\{\s*companyBusinessDate\s*\}\s*from\s*"\.\.\/lib\/company-business-date\.js"/.test(woSrc)) {
    failures.push(`${WO_FILE}: no longer imports companyBusinessDate`);
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodWarranty = `
    import { companyBusinessDate } from "../lib/company-business-date.js";
    const today = companyBusinessDate();
    const purchasedAt = body.purchased_at ?? companyBusinessDate();
    entry_date_iso: companyBusinessDate(),
  `;
  const goodParts = `
    import { companyBusinessDate } from "../lib/company-business-date.js";
    entry_date_iso: companyBusinessDate(),
  `;
  const goodWo = `
    import { companyBusinessDate } from "../lib/company-business-date.js";
    const today = companyBusinessDate();
    const originalDate = bill.bill_date && bill.bill_date.length >= 10 ? bill.bill_date.slice(0, 10) : today;
  `;
  const regressedWarrantyOneSite = goodWarranty.replace(
    "const today = companyBusinessDate();",
    'const today = new Date().toISOString().slice(0, 10);'
  );
  const regressedWarrantyNoImport = goodWarranty.replace(
    'import { companyBusinessDate } from "../lib/company-business-date.js";\n    ',
    ""
  );
  const regressedPartsOneSite = goodParts.replace(
    "entry_date_iso: companyBusinessDate(),",
    "entry_date_iso: new Date().toISOString().slice(0, 10),"
  );
  const regressedWoOneSite = goodWo.replace(
    "const today = companyBusinessDate();",
    "const today = new Date().toISOString().slice(0, 10);"
  );
  const regressedWoNoImport = goodWo.replace(
    'import { companyBusinessDate } from "../lib/company-business-date.js";\n    ',
    ""
  );

  const checks = [
    ["fully-fixed shape produces zero failures", check({ warranty: goodWarranty, parts: goodParts, wo: goodWo }).length === 0],
    ["one remaining raw-UTC site in warranty.routes.ts is caught", check({ warranty: regressedWarrantyOneSite, parts: goodParts, wo: goodWo }).some((f) => f.includes(WARRANTY_FILE) && f.includes("occurrence"))],
    ["missing companyBusinessDate import in warranty.routes.ts is caught", check({ warranty: regressedWarrantyNoImport, parts: goodParts, wo: goodWo }).some((f) => f.includes("no longer imports"))],
    ["one remaining raw-UTC site in parts-inventory.routes.ts is caught", check({ warranty: goodWarranty, parts: regressedPartsOneSite, wo: goodWo }).some((f) => f.includes(PARTS_FILE) && f.includes("occurrence"))],
    ["one remaining raw-UTC site in work-orders.routes.ts is caught", check({ warranty: goodWarranty, parts: goodParts, wo: regressedWoOneSite }).some((f) => f.includes(WO_FILE) && f.includes("occurrence"))],
    ["missing companyBusinessDate import in work-orders.routes.ts is caught", check({ warranty: goodWarranty, parts: goodParts, wo: regressedWoNoImport }).some((f) => f.includes(WO_FILE) && f.includes("no longer imports"))],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — maintenance warranty/parts/work-order business dates and GL posting dates use companyBusinessDate(), not raw UTC`);
}
