#!/usr/bin/env node
/**
 * 363-CUR-A — every balance surface declares cleared vs uncleared and names not-cleared documents.
 * Derived from GL + bank-feed. No stored cleared total.
 *
 * UnclearedDocumentsNote is the declaration: the component renders "{amount} not cleared".
 * A surface that mounts that note does not need a second copy of the phrase.
 */
import fs from "node:fs";
import path from "node:path";

const REQUIRED = [
  "apps/frontend/src/pages/CustomerDetail.tsx",
  "apps/frontend/src/pages/home/roles/AccountingHome.tsx",
  "apps/frontend/src/pages/vendors/VendorsListView.tsx",
  "apps/frontend/src/pages/Vendors.tsx",
  "apps/frontend/src/pages/Customers.tsx",
  "apps/frontend/src/pages/vendors/VendorListSidebar.tsx",
  "apps/frontend/src/pages/customers/CustomerListSidebar.tsx",
  "apps/frontend/src/pages/accounting/VendorBalancesPage.tsx",
  "apps/frontend/src/pages/home/QboStyleHomePage.tsx",
  "apps/frontend/src/pages/customers/CustomersListView.tsx",
  "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
  "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
  "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  "apps/frontend/src/pages/reports/APAgingPage.tsx",
  "apps/frontend/src/pages/factoring/FactoringHome.tsx",
  "apps/frontend/src/pages/home/OwnerHome.tsx",
  "apps/frontend/src/pages/home/roles/DefaultHome.tsx",
  "apps/frontend/src/pages/vendors/VendorApAgingSection.tsx",
];

/** Surfaces that still omit the note. Shrink-only — a new name here is a regression. */
const REMAINING = [];

const HELPER = "apps/backend/src/accounting/uncleared-applied-documents.ts";
const REMAINING_CEILING = 0;
const NOTE = "apps/frontend/src/components/accounting/UnclearedDocumentsNote.tsx";

export function run(root = process.cwd()) {
  const problems = [];
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      return null;
    }
  };

  const noteSrc = read(NOTE);
  if (!noteSrc) problems.push(`${NOTE}: missing`);
  else if (!/not cleared/.test(noteSrc)) {
    problems.push(`${NOTE}: must render "not cleared"`);
  }

  const helper = read(HELPER);
  if (!helper) problems.push(`${HELPER}: missing`);
  else {
    for (const needle of [
      "listUnclearedCustomerPayments",
      "listUnclearedBillPayments",
      "listUnclearedFactoringAdvances",
      "factoringClearedOpenCents",
      "cleared_open_cents: openCents + uncleared_cents",
      "matched_factoring_advance_id",
    ]) {
      if (!helper.includes(needle)) problems.push(`${HELPER}: missing ${needle}`);
    }
    if (/CREATE TABLE|INSERT INTO accounting\./i.test(helper)) {
      problems.push(`${HELPER}: must not invent a stored cleared total`);
    }
  }

  for (const rel of REQUIRED) {
    const src = read(rel);
    if (!src) {
      problems.push(`${rel}: missing`);
      continue;
    }
    const hasNote =
      src.includes("UnclearedDocumentsNote") || src.includes("FactoringBalanceClearedNote");
    if (!hasNote) {
      problems.push(`${rel}: missing UnclearedDocumentsNote`);
    }
    if (!hasNote && !/not cleared/.test(src)) {
      problems.push(`${rel}: missing "not cleared" copy`);
    }
    if (
      !/cleared_open_cents|Cleared /.test(src) &&
      !src.includes("FactoringBalanceClearedNote") &&
      !src.includes("UnclearedDocumentsNote")
    ) {
      problems.push(`${rel}: missing cleared declaration`);
    }
  }

  if (REMAINING.length > REMAINING_CEILING) {
    problems.push(`remaining balance surfaces ${REMAINING.length} > ceiling ${REMAINING_CEILING}`);
  }
  for (const rel of REMAINING) {
    if (REQUIRED.includes(rel)) problems.push(`${rel}: cannot be both required and remaining`);
    const src = read(rel);
    if (!src) problems.push(`${rel}: remaining surface missing`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-every-balance-surface-");
  const write = (rel, body) => {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const note = 'import { UnclearedDocumentsNote } from "x";\nCleared {x}\nUnclearedDocumentsNote\ncleared_open_cents';
  for (const rel of REQUIRED) write(rel, note);
  for (const rel of REMAINING) write(rel, "balance only");
  write(NOTE, "{formatUsdCents(d.amount_cents)} not cleared\n");
  write(
    HELPER,
    "listUnclearedCustomerPayments\nlistUnclearedBillPayments\nlistUnclearedFactoringAdvances\nfactoringClearedOpenCents\ncleared_open_cents: openCents + uncleared_cents\nmatched_factoring_advance_id\n",
  );
  const ok = run(tmp);
  if (ok.length) throw new Error("PASS fail: " + ok.join(" | "));

  write(REQUIRED[REQUIRED.length - 1], "outstanding_liability_balance only");
  const bad = run(tmp);
  if (!bad.length) throw new Error("FAIL fail: required surface drop should fail");

  write(REQUIRED[REQUIRED.length - 1], note);
  write(HELPER, "listUnclearedCustomerPayments\nlistUnclearedBillPayments\n");
  const badHelper = run(tmp);
  if (!badHelper.some((p) => p.includes("listUnclearedFactoringAdvances"))) {
    throw new Error("FAIL fail: helper drop should fail");
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-every-balance-surface-declares-cleared-and-uncleared --selftest OK");
} else {
  const problems = run();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(
    `verify-every-balance-surface-declares-cleared-and-uncleared OK — ${REQUIRED.length} required, remaining ${REMAINING.length} ≤ ${REMAINING_CEILING}`,
  );
}
