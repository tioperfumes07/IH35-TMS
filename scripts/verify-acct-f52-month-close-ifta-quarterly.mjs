#!/usr/bin/env node
/**
 * ACCT-F52 — Month Close "Fuel tax filing" checklist item read the WRONG table.
 *
 * Defect: apps/backend/src/accounting/month-close.service.ts#loadChecklist checked
 * `accounting.sales_tax_returns` (an unrelated STATE sales-tax table — columns
 * taxable_sales_cents/tax_collected_cents, zero rows, zero relation to fuel/IFTA) for a
 * period_start/period_end MONTHLY match. IFTA fuel tax is filed QUARTERLY into the canonical
 * `reports.ifta_filings` table (quarter label "YYYY-Q#", see
 * apps/backend/src/reports/ifta/mileage-aggregator.service.ts#parseQuarterLabel). The checklist
 * item would therefore ALWAYS report "not filed" for a reason that has nothing to do with IFTA,
 * and would block month-end close in the two non-quarter-end months of every quarter for a filing
 * that is not even due yet.
 *
 * Fix: read `reports.ifta_filings` keyed by the derived IFTA quarter label; only require it be
 * `status = 'filed'` to unblock close on the LAST month of that quarter (Mar/Jun/Sep/Dec) — the
 * other two months of the quarter have nothing due and never block on this item. The frontend
 * checklist detail line names the quarter and whether a filing is even due this month, instead of
 * a bare true/false against the wrong dataset.
 *
 * This is a static regression guard (string-anchored). Live proof of the corrected query shape was
 * taken against Neon prod `br-fancy-credit-akjnd07a` (bypass lucia, TRANSP 91e0bf0a-...) — see PR
 * body — confirming `reports.ifta_filings(operating_company_id, quarter, status)` resolves without
 * error while `accounting.sales_tax_returns` is a distinct, unrelated, always-empty table.
 *
 *   node scripts/verify-acct-f52-month-close-ifta-quarterly.mjs
 *   node scripts/verify-acct-f52-month-close-ifta-quarterly.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-f52-month-close-ifta-quarterly";

const FILES = {
  service: "apps/backend/src/accounting/month-close.service.ts",
  page: "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
  apiType: "apps/frontend/src/api/accounting.ts",
  test: "apps/backend/src/accounting/__tests__/month-close.service.test.ts",
};

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export function contractErrors(src) {
  const errors = [];

  // The defect: the fuel-tax checklist item must never read the unrelated state sales-tax table.
  if (/FROM\s+accounting\.sales_tax_returns/i.test(src.service)) {
    errors.push(
      "REGRESSION: month-close.service.ts must not read accounting.sales_tax_returns for the IFTA fuel-tax checklist item (unrelated state sales-tax table, always empty)"
    );
  }

  // The fix: canonical IFTA table, keyed by the derived quarter label.
  if (!/FROM\s+reports\.ifta_filings/i.test(src.service)) {
    errors.push("month-close.service.ts must read reports.ifta_filings (canonical IFTA filings table)");
  }
  if (!/f\.quarter\s*=\s*\$2::text/.test(src.service)) {
    errors.push("month-close.service.ts must filter reports.ifta_filings by quarter label, not by period_start/period_end");
  }
  if (!/f\.status\s*=\s*['"]filed['"]/.test(src.service)) {
    errors.push("month-close.service.ts must require status='filed' (not merely drafted/approved) to count as filed");
  }

  // Quarter derivation + gating: IFTA is due only in the LAST month of each quarter.
  if (!/function iftaQuarterInfo/.test(src.service)) {
    errors.push("month-close.service.ts must derive the IFTA quarter label + due-this-month flag via iftaQuarterInfo");
  }
  if (!/month\s*%\s*3\s*===\s*0/.test(src.service)) {
    errors.push("iftaQuarterInfo must gate due_this_month to quarter-closing months only (month % 3 === 0)");
  }
  if (!/!iftaDueThisMonth\s*\|\|\s*iftaFiled/.test(src.service)) {
    errors.push("fuelTaxComplete must not block close in a non-quarter-end month (!iftaDueThisMonth || iftaFiled)");
  }

  // Response shape carries the new fields through to the API type + UI.
  for (const needle of ["quarter_label", "due_this_month"]) {
    if (!src.service.includes(needle)) errors.push(`MonthCloseStatus response must include ${needle}`);
    if (!src.apiType.includes(needle)) errors.push(`frontend MonthCloseStatus type must include ${needle}`);
  }
  if (!/status\.fuel_tax\.due_this_month/.test(src.page)) {
    errors.push("MonthClosePage must branch checklist detail text on due_this_month (not just ifta_filed)");
  }
  if (!/status\.fuel_tax\.quarter_label/.test(src.page)) {
    errors.push("MonthClosePage must name the IFTA quarter in the checklist detail text");
  }

  // Regression test coverage: a quarter-end month must be exercised, not just mid-quarter fixtures.
  if (!/FROM\s+reports\.ifta_filings/.test(src.test)) {
    errors.push("month-close.service.test.ts fixtures must mock reports.ifta_filings, not the retired table");
  }
  if (!/due_this_month\)\.toBe\(true\)/.test(src.test)) {
    errors.push("month-close.service.test.ts must cover a quarter-end month where due_this_month is true");
  }
  if (/FROM\s+accounting\.sales_tax_returns/i.test(src.test)) {
    errors.push("month-close.service.test.ts must not mock the retired accounting.sales_tax_returns table");
  }

  return errors;
}

function selftest() {
  const good = {
    service: [
      "function iftaQuarterInfo(year, month) { return { quarterLabel: `${year}-Q${Math.ceil(month / 3)}`, dueThisMonth: month % 3 === 0 }; }",
      "FROM reports.ifta_filings f",
      "WHERE f.operating_company_id = $1::uuid AND f.quarter = $2::text AND f.status = 'filed'",
      "const fuelTaxComplete = !iftaDueThisMonth || iftaFiled;",
      "quarter_label: checklist.iftaQuarterLabel,",
      "due_this_month: checklist.iftaDueThisMonth,",
    ].join("\n"),
    page: [
      "status.fuel_tax.due_this_month",
      "status.fuel_tax.quarter_label",
    ].join("\n"),
    apiType: "quarter_label: string;\ndue_this_month: boolean;",
    test: [
      "if (sql.includes(\"FROM reports.ifta_filings\")) return { rows: [{ ifta_filed: false }] };",
      "expect(status.fuel_tax.due_this_month).toBe(true);",
    ].join("\n"),
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }

  const bad = {
    ...good,
    service: [
      "FROM accounting.sales_tax_returns r",
      "WHERE r.operating_company_id = $1::uuid AND r.period_start = $2::date AND r.period_end = $3::date AND r.status IN ('filed', 'paid')",
      "const fuelTaxComplete = iftaFiled;",
    ].join("\n"),
  };
  const badErrors = contractErrors(bad);
  if (!badErrors.some((e) => e.includes("REGRESSION"))) {
    console.error(`${LABEL} --selftest FAIL: bad fixture (old wrong-table query) not caught`, badErrors);
    process.exit(1);
  }

  const badTest = { ...good, test: "if (sql.includes(\"FROM accounting.sales_tax_returns\")) return { rows: [{ ifta_filed: true }] };" };
  if (!contractErrors(badTest).some((e) => e.includes("retired"))) {
    console.error(`${LABEL} --selftest FAIL: stale test fixture not caught`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(ROOT, rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — Month Close fuel-tax checklist item reads canonical reports.ifta_filings, keyed by quarter, gated to quarter-end months`
);
process.exit(0);
