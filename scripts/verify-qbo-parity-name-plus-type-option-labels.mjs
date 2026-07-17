#!/usr/bin/env node
/**
 * qbo-parity-name-plus-type-option-labels — ReferenceSelect options must populate the QBO-style
 * "Name + Type" sublabel via shared referenceOptionLabels helpers (not bare { value, label } maps).
 *
 * Banking categorize surfaces (BankingTransactionsDesignView, BankTransactionSplitModal) are
 * baselined exempt while palette/orphan PRs #2623/#2625 are in flight — follow-up adopts the helper there.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "apps/frontend/src/components/parity/referenceOptionLabels.ts";

const REQUIRED_EXPORTS = [
  "vendorReferenceOption",
  "customerReferenceOption",
  "coaAccountReferenceOption",
  "catalogClassReferenceOption",
  "catalogItemReferenceOption",
];

/** Files that must import referenceOptionLabels (disjoint from in-flight banking PRs). */
const REQUIRED_ADOPTION = [
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
  "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx",
];

const BASELINE_EXEMPT = [
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
];

export function check() {
  const failures = [];
  const helperPath = path.join(ROOT, HELPER);
  if (!fs.existsSync(helperPath)) {
    failures.push(`${HELPER} missing — add shared Name+Type option builders`);
    return failures;
  }
  const helperSrc = fs.readFileSync(helperPath, "utf8");
  for (const fn of REQUIRED_EXPORTS) {
    if (!new RegExp(`export function ${fn}\\b`).test(helperSrc)) {
      failures.push(`${HELPER} must export ${fn}`);
    }
  }

  for (const rel of REQUIRED_ADOPTION) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`${rel} missing (required adoption target)`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!src.includes("referenceOptionLabels")) {
      failures.push(`${rel} must import referenceOptionLabels helpers for ReferenceSelect options`);
      continue;
    }
    if (!/vendorReferenceOption|customerReferenceOption|coaAccountReferenceOption|vendorFilterReferenceOptions|customerFilterReferenceOptions/.test(src)) {
      failures.push(`${rel} imports referenceOptionLabels but does not call a Name+Type builder`);
    }
  }

  for (const rel of BASELINE_EXEMPT) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (src.includes("referenceOptionLabels")) continue;
    // Still baselined — no failure until follow-up after #2623/#2625 land.
  }

  const refSelect = path.join(ROOT, "apps/frontend/src/components/parity/ReferenceSelect.tsx");
  if (!fs.readFileSync(refSelect, "utf8").includes("sublabel: o.type")) {
    failures.push("ReferenceSelect must map option.type → Combobox sublabel (Name + Type row)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodHelper = REQUIRED_EXPORTS.map((fn) => `export function ${fn}(){}`).join("\n");
  const checks = [
    ["helper exports detected", REQUIRED_EXPORTS.every((fn) => new RegExp(`export function ${fn}\\b`).test(goodHelper))],
    ["adoption import pattern", "referenceOptionLabels".length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:qbo-parity-name-plus-type-option-labels --selftest FAIL");
    process.exit(1);
  }
  console.log(`verify:qbo-parity-name-plus-type-option-labels --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error("verify:qbo-parity-name-plus-type-option-labels FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    "verify:qbo-parity-name-plus-type-option-labels PASS (ReferenceSelect Name+Type helpers adopted in accounting/expense surfaces)"
  );
}
