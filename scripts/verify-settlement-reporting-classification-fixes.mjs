#!/usr/bin/env node
// Two settlement-reporting fixes, both measured live by GPT (docs/bus/OUTBOX-GPT.md,
// "SETTLE-SWEEP" entries) and independently re-confirmed live (Neon tiny-field-89581227,
// bypass_rls=lucia) before this guard shipped, 2026-09-11. Neither touches a posted journal entry
// or GL math -- both are reporting-classification/display-only fixes.
//
// 1. COMPANY SETTLEMENT REPORT double-counted escrow withholding as a company expense.
//    company-settlement-report.service.ts's P&L rollup (netRevenueCents) subtracted
//    "escrow"/"escrow_contribution" settlement_lines as if they were expenses. Per owner-locked
//    law (driver escrow = liability, not expense) and confirmed live in
//    settlement-lines-materialize.service.ts / settlement-payrun-close.service.ts,
//    escrow_contribution posts as a CREDIT to the driver's own escrow LIABILITY sub-account, never
//    a debit to an expense account -- it's a pure driver-pay withholding, not an additional company
//    cost. Live example: CS-2026-0013 displayed $2,639.85 vs the correct $2,664.85, a $25
//    escrow-driven distortion (matches the live total: 20 escrow_contribution rows, $500 sum,
//    averaging $25/row). Fix: excluded from the deduction set that reduces netRevenueCents.
//
// 2. SETTLEMENT DISPUTES TAB combined Settlement Period into one column (period_start "to"
//    period_end string-concatenated) and had no settlement-identity column at all, despite the API
//    already returning settlement_id/settlement_display_id (used elsewhere in the same file's
//    detail drawer). Same systemic "one datum per column" pattern the owner named loudest under
//    REG-010/011, landing on a driver-finance settlements surface. Fix: split into separate
//    "Period Start"/"Period End" columns and added a "Settlement #" EntityLink column
//    (alwaysVisible, matching the REG-017/BillsPage.tsx precedent).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname_of(fileURLToPath(import.meta.url));
function dirname_of(p) {
  return path.dirname(p);
}
const repoRoot = path.join(__dirname, "..");
const REPORT_SERVICE = path.join(repoRoot, "apps/backend/src/accounting/company-settlement-report.service.ts");
const DISPUTES_TAB = path.join(repoRoot, "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx");

/** Pure: does this deductionLineTypes Set-literal source snippet wrongly include escrow types? */
export function auditDeductionLineTypesSnippet(snippet) {
  const failures = [];
  if (/"escrow_contribution"/.test(snippet)) {
    failures.push('deductionLineTypes still includes "escrow_contribution" -- double-counts a liability withholding as a company expense');
  }
  if (/"escrow"(?!_)/.test(snippet)) {
    failures.push('deductionLineTypes still includes bare "escrow" -- same liability-class defect');
  }
  return failures;
}

/** Pure: does this columns-array source snippet have the split period columns + settlement column? */
export function auditDisputesColumnsSnippet(snippet) {
  const failures = [];
  if (!/key:\s*"period_start"/.test(snippet)) failures.push('missing a dedicated "period_start" column');
  if (!/key:\s*"period_end"/.test(snippet)) failures.push('missing a dedicated "period_end" column');
  if (/\{row\.period_start[\s\S]{0,40}\}\s*to\s*\{row\.period_end/.test(snippet)) {
    failures.push('period_start and period_end are still concatenated into one rendered string ("X to Y")');
  }
  if (!/key:\s*"settlement_display_id"/.test(snippet) || !/kind="settlement"/.test(snippet)) {
    failures.push('missing a settlement-identity column (settlement_display_id via EntityLink kind="settlement")');
  }
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const badDeductions = `const deductionLineTypes = new Set(["extra_pay", "escrow", "escrow_contribution"]);`;
  assert.ok(auditDeductionLineTypesSnippet(badDeductions).length === 2, "must catch both escrow and escrow_contribution in the deduction set");

  const goodDeductions = `const deductionLineTypes = new Set(["extra_pay", "reimbursement", "deduction"]);`;
  assert.ok(auditDeductionLineTypesSnippet(goodDeductions).length === 0, "a clean deduction set (no escrow types) must pass");

  const badColumns = `{ key: "period", label: "Settlement Period", render: (row) => (<span>{row.period_start ? x : "—"} to {row.period_end ? y : "—"}</span>) }`;
  assert.ok(auditDisputesColumnsSnippet(badColumns).length >= 2, "must catch the combined period column AND the missing settlement column");

  const goodColumns = `
    { key: "settlement_display_id", label: "Settlement #", alwaysVisible: true, render: (row) => <EntityLink kind="settlement" id={row.settlement_id} label={row.settlement_display_id} /> },
    { key: "period_start", label: "Period Start", render: (row) => row.period_start },
    { key: "period_end", label: "Period End", render: (row) => row.period_end },
  `;
  assert.ok(auditDisputesColumnsSnippet(goodColumns).length === 0, "the fixed shape (split periods + settlement column) must pass");

  console.log("verify-settlement-reporting-classification-fixes --selftest PASS");
}

function run() {
  const failures = [];

  if (!fs.existsSync(REPORT_SERVICE)) {
    failures.push(`${path.relative(repoRoot, REPORT_SERVICE)}: missing`);
  } else {
    const src = fs.readFileSync(REPORT_SERVICE, "utf8");
    const match = src.match(/const deductionLineTypes = new Set\(\[[\s\S]*?\]\);/);
    if (!match) {
      failures.push(`${path.relative(repoRoot, REPORT_SERVICE)}: could not find the deductionLineTypes Set literal -- may have been restructured`);
    } else {
      for (const f of auditDeductionLineTypesSnippet(match[0])) failures.push(`${path.relative(repoRoot, REPORT_SERVICE)}: ${f}`);
    }
  }

  if (!fs.existsSync(DISPUTES_TAB)) {
    failures.push(`${path.relative(repoRoot, DISPUTES_TAB)}: missing`);
  } else {
    const src = fs.readFileSync(DISPUTES_TAB, "utf8");
    for (const f of auditDisputesColumnsSnippet(src)) failures.push(`${path.relative(repoRoot, DISPUTES_TAB)}: ${f}`);
  }

  if (failures.length) {
    console.error("verify-settlement-reporting-classification-fixes FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-settlement-reporting-classification-fixes: OK -- escrow excluded from the company " +
      "settlement P&L rollup, and the Disputes tab shows split Period Start/End + a Settlement # column"
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
