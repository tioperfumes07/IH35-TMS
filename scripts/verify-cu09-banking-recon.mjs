#!/usr/bin/env node
/** LST-F146 / CU-09 — banking recon + related create/close surfaces use userFacingApiError. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-banking-recon";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/frontend/src/pages/banking/BankingHome.tsx",
  "apps/frontend/src/pages/banking/BankReconciliationPage.tsx",
  "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx",
  "apps/frontend/src/pages/banking/components/ManualJEModal.tsx",
  "apps/frontend/src/pages/banking/components/ManageAccountsModal.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/banking/ReconMatchSuggestions.tsx",
  "apps/frontend/src/pages/banking/BankAccountDetail.tsx",
  "apps/frontend/src/pages/banking/TransfersListPage.tsx",
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
  "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  "apps/frontend/src/pages/banking/components/CategorizeDrawer.tsx",
  "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
  "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx",
  "apps/frontend/src/pages/accounting/CashForecastPage.tsx",
  "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx",
  "apps/frontend/src/pages/lists/ListsHubPage.tsx",
  "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  "apps/frontend/src/pages/cash-advances/components/MarkDisbursedModal.tsx",
  "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx"
];

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (!/userFacingApiError\(/.test(src)) problems.push(`${file}: missing userFacingApiError`);
    if (/String\(\(error as Error\)\.message/.test(src)) problems.push(`${file}: still stringifies Error.message`);
    if (/import \{\s*\nimport /.test(src)) problems.push(`${file}: broken multi-line import`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replaceAll("userFacingApiError(", "String((error as Error).message || ");
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
