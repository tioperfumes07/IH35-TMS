#!/usr/bin/env node
/**
 * GUARD: cash-advances CreateAdvanceModal.tsx's billsQuery (unpaid-bill dropdown) and
 * bankAccountsQuery (bank-account dropdown) must render a real error state on failure, never let
 * a failed fetch masquerade as "nothing to select" — matching the file's own advanceTypesQuery
 * pattern.
 *
 * ROOT CAUSE this freezes shut: billsQuery and bankAccountsQuery never referenced .isError, while
 * the SAME file's advanceTypesQuery correctly surfaces a small inline message on isError. A
 * failed fetch on either dropdown silently rendered as if the company has zero unpaid bills / zero
 * bank accounts — indistinguishable from a genuinely empty list — on a modal that creates a real
 * driver cash advance and can move money by direct bank transfer or bill linkage.
 *
 * Static-only (text-pattern) check against the real component file: each dropdown's own
 * <option value="">Select ...</option> line must be followed, within a modest window, by its
 * query's .isError gating a distinct inline message — window sizes measured directly against the
 * real file (261/111 chars for bank account, 403/108 chars for unpaid bill) with headroom.
 *
 * Run:  node scripts/verify-create-advance-modal-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(
  root,
  "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx"
);
const LABEL = "verify-create-advance-modal-error-state";

const BANK_RE =
  /Select bank account[\s\S]{0,400}bankAccountsQuery\.isError[\s\S]{0,150}Could not load bank accounts/;
const BILL_RE =
  /Select unpaid bill[\s\S]{0,600}billsQuery\.isError[\s\S]{0,150}Could not load unpaid bills/;

export function checkCreateAdvanceModalErrorState(src) {
  const problems = [];

  if (!/bankAccountsQuery\.isError/.test(src) || !BANK_RE.test(src)) {
    problems.push(
      "bankAccountsQuery.isError does not gate an inline error message near the bank-account dropdown — a failed fetch renders identically to zero bank accounts"
    );
  }

  if (!/billsQuery\.isError/.test(src) || !BILL_RE.test(src)) {
    problems.push(
      "billsQuery.isError does not gate an inline error message near the unpaid-bill dropdown — a failed fetch renders identically to zero unpaid bills"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    <label className="space-y-1" data-field="from_bank_account_id">
      <span className="font-medium text-gray-700">Bank account</span>
      <SelectCombobox value={fromBankAccountId} onChange={onChange}>
        <option value="">Select bank account</option>
        {bankAccounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </SelectCombobox>
    </label>
    <label className="space-y-1">
      <span className="font-medium text-gray-700">Unpaid bill</span>
      <SelectCombobox value={linkedBillId} onChange={onChange}>
        <option value="">Select unpaid bill</option>
        {(billsQuery.data?.bills ?? []).map((bill) => (
          <option key={String(bill.id)} value={String(bill.id)}>{bill.display_id}</option>
        ))}
      </SelectCombobox>
    </label>
  `;
  const badProblems = checkCreateAdvanceModalErrorState(bad);
  if (badProblems.length !== 2) {
    failures.push(
      `the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkCreateAdvanceModalErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: only the bank-account dropdown fixed, unpaid-bill dropdown still not.
  const partial = bad.replace(
    "</SelectCombobox>\n    </label>\n    <label className=\"space-y-1\">\n      <span className=\"font-medium text-gray-700\">Unpaid bill",
    "</SelectCombobox>\n      {bankAccountsQuery.isError ? (\n        <p>Could not load bank accounts — retry.</p>\n      ) : null}\n    </label>\n    <label className=\"space-y-1\">\n      <span className=\"font-medium text-gray-700\">Unpaid bill"
  );
  const partialProblems = checkCreateAdvanceModalErrorState(partial);
  if (partialProblems.length !== 1) {
    failures.push(
      `a partial fix (bank account scoped, unpaid bill still not) expected 1 problem, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (2/2), the real fixed file clears, a ` +
      `partial (only one dropdown scoped) regression caught (1/1).`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkCreateAdvanceModalErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — CreateAdvanceModal.tsx's billsQuery and bankAccountsQuery both render real error states on failure, matching the file's own advanceTypesQuery pattern.`
);
