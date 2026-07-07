#!/usr/bin/env node
/**
 * verify-banking-workflow-b-archived.mjs
 *
 * Ensures that the Workflow-B banking categorization files (superseded by
 * BankingTransactionsDesignView) remain present AND carry their @archived
 * annotation. This prevents accidental deletion AND accidental re-wiring.
 *
 * Workflow-B = the older categorization flow (BankTxCategorizationPage +
 * CategorizeDrawer + forms/*) that was built before BankingTransactionsDesignView
 * became the live surface. The files are kept for audit history but must NOT
 * be wired into any route.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const WORKFLOW_B_FILES = [
  "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx",
  "apps/frontend/src/pages/banking/components/CategorizeDrawer.tsx",
  "apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/CreateExpenseForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/DriverSettlementForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/FactoringAdvanceForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/ManualJEForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/SplitTransactionModal.tsx",
  "apps/frontend/src/pages/banking/components/forms/TransferForm.tsx",
];

const ARCHIVE_MARKER = "@archived — Workflow-B";

const failures = [];

for (const rel of WORKFLOW_B_FILES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} — MISSING (do not delete archived files; mark @archived instead)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  if (!source.includes(ARCHIVE_MARKER)) {
    failures.push(`${rel} — missing "@archived — Workflow-B" annotation`);
  }
}

if (failures.length > 0) {
  console.error("[verify-banking-workflow-b-archived] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-banking-workflow-b-archived] OK — ${WORKFLOW_B_FILES.length} Workflow-B files present and annotated`);
