#!/usr/bin/env node
/**
 * L5 — Settlement detail section tables guard.
 *
 * Verifies the 5 settlement detail sections match the reference design
 * (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html):
 *   1. EarningsSection: has Date, From, To columns (S.1b fields)
 *   2. DeadheadPaySection: has Date, From, To columns
 *   3. ExtraPaySection: uses ParityTable, has Date, Type, Status columns + Add button
 *   4. ReimbursementsSection: has Vendor, Category, Vendor invoice columns + Add button
 *   5. DeductionsSection: has Date, Type, Posting account columns + Add button
 *   6. All sections accept isOpen prop (lock at Close)
 *   7. SettlementDetailPage passes isOpen to each section
 *   8. All sections use mmmDd for dates
 *
 * Static source check — no DB needed.
 */
import fs from "node:fs";

const WORKFLOW_PAGE = "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx";
const STATEMENT_TAB_PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const LINE_MAPS = "apps/frontend/src/pages/driver-finance/settlementDetailLineMaps.ts";
const EARNINGS = "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx";
const DEADHEAD = "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx";
const EXTRA_PAY = "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx";
const REIMBURSEMENTS = "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx";
const DEDUCTIONS = "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx";

let failures = 0;

function fail(msg) {
  console.error(`FAIL verify-settlement-detail-sections: ${msg}`);
  failures += 1;
}

function checkFile(path, label, checks) {
  if (!fs.existsSync(path)) {
    fail(`${label}: file not found at ${path}`);
    return "";
  }
  const src = fs.readFileSync(path, "utf8");
  for (const check of checks) {
    if (!check.pattern.test(src)) {
      fail(`${label}: ${check.description}`);
    }
  }
  return src;
}

// EarningsSection
checkFile(EARNINGS, "EarningsSection", [
  { pattern: /origin_city/, description: "origin_city field not found (S.1b From column)" },
  { pattern: /dest_city/, description: "dest_city field not found (S.1b To column)" },
  { pattern: /line_date/, description: "line_date field not found (S.1b Date column)" },
  { pattern: /mmmDd/, description: "mmmDd date formatting not found" },
  { pattern: /ParityTable/, description: "ParityTable not found" },
  { pattern: /isOpen/, description: "isOpen prop not found (lock at Close)" },
]);

// DeadheadPaySection
checkFile(DEADHEAD, "DeadheadPaySection", [
  { pattern: /origin_city/, description: "origin_city field not found (S.1b From column)" },
  { pattern: /dest_city/, description: "dest_city field not found (S.1b To column)" },
  { pattern: /line_date/, description: "line_date field not found (S.1b Date column)" },
  { pattern: /mmmDd/, description: "mmmDd date formatting not found" },
  { pattern: /isOpen/, description: "isOpen prop not found (lock at Close)" },
]);

// ExtraPaySection
checkFile(EXTRA_PAY, "ExtraPaySection", [
  { pattern: /ParityTable/, description: "ParityTable not found (must use ParityTable, not card layout)" },
  { pattern: /line_date/, description: "line_date field not found (Date column)" },
  { pattern: /approval_status/, description: "approval_status field not found (Status column)" },
  { pattern: /Add.*additional.*pay|Add.*pay/i, description: "+ Add additional pay button not found" },
  { pattern: /isOpen/, description: "isOpen prop not found (lock at Close)" },
]);

// ReimbursementsSection
checkFile(REIMBURSEMENTS, "ReimbursementsSection", [
  { pattern: /vendor_name/, description: "vendor_name field not found (Vendor column)" },
  { pattern: /reimbursement_type/, description: "reimbursement_type field not found (Category column)" },
  { pattern: /vendor_invoice_number/, description: "vendor_invoice_number field not found (Vendor invoice column)" },
  { pattern: /Add.*reimb/i, description: "+ Add reimbursement button not found" },
  { pattern: /isOpen/, description: "isOpen prop not found (lock at Close)" },
]);

// DeductionsSection
checkFile(DEDUCTIONS, "DeductionsSection", [
  { pattern: /line_date/, description: "line_date field not found (Date column)" },
  { pattern: /deduction_type/, description: "deduction_type field not found (Type column)" },
  { pattern: /posting_account_number/, description: "posting_account_number field not found (Posting account column)" },
  { pattern: /posting_account_name/, description: "posting_account_name field not found (Posting account column)" },
  { pattern: /Add.*deduct/i, description: "+ Add deduction button not found" },
  { pattern: /isOpen/, description: "isOpen prop not found (lock at Close)" },
]);

// Workflow passes isOpen + S.1b fields via shared line maps
checkFile(WORKFLOW_PAGE, "SettlementStatementWorkflowPage", [
  { pattern: /isOpen=\{!(?:settlementIsLocked|settlementIsReadOnly)\}/, description: "isOpen prop not passed to sections" },
  { pattern: /buildSettlementLineViews/, description: "buildSettlementLineViews not used for section rows" },
]);

checkFile(LINE_MAPS, "settlementDetailLineMaps", [
  { pattern: /origin_city/, description: "origin_city not mapped from API response" },
  { pattern: /dest_city/, description: "dest_city not mapped from API response" },
  { pattern: /line_date/, description: "line_date not mapped from API response" },
  { pattern: /posting_account_number/, description: "posting_account_number not mapped from API response" },
  { pattern: /reimbursement_type/, description: "reimbursement_type not mapped from API response" },
]);

// Statement tab (443.293-A): read-only eight-section document
checkFile(STATEMENT_TAB_PAGE, "SettlementDetailPage Statement tab", [
  { pattern: /SettlementDocumentBody/, description: "SettlementDocumentBody not mounted on Statement tab" },
  { pattern: /buildSettlementLineViews/, description: "buildSettlementLineViews not used on Statement tab" },
  { pattern: /isOpen=\{false\}/, description: "Statement tab document must be read-only (isOpen={false})" },
]);

if (failures > 0) {
  console.error(`\n[verify-settlement-detail-sections] FAIL — ${failures} issue(s)`);
  process.exit(1);
}

console.log("[verify-settlement-detail-sections] PASS — 5 section tables match reference design with S.1b fields");
process.exit(0);
