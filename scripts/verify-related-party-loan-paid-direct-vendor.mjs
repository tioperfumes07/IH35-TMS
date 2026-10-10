#!/usr/bin/env node
/**
 * 18370 — ROUND 443.22-2e Paid directly to a vendor (no company bank line).
 *
 * Asserts: migration widens target_type + funding_account_id / intermediary_name;
 * create route treats paid_direct_vendor as funding (note path), refuses bank_transaction_id,
 * requires direction=in + funding_account_id; wizard exposes Paid directly to a vendor with
 * debit-account + intermediary fields and never stamps a bank reverse pointer.
 *
 * Owned paths (gate-step-map):
 *   db/migrations/202615471200_related_party_loan_paid_direct_vendor.sql
 *   apps/backend/src/accounting/related-party-loan-posting/routes.ts
 *   apps/frontend/src/api/related-party-loans.ts
 *   apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx
 *   apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx
 *
 * Run: node scripts/verify-related-party-loan-paid-direct-vendor.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-loan-paid-direct-vendor";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  migration: "db/migrations/202615471200_related_party_loan_paid_direct_vendor.sql",
  routes: "apps/backend/src/accounting/related-party-loan-posting/routes.ts",
  feApi: "apps/frontend/src/api/related-party-loans.ts",
  wizard: "apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx",
  page: "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

export function staticProblems(srcs) {
  const errors = [];
  const { migration, routes, feApi, wizard, page } = srcs;

  // F1 — migration: target_type + debit account + intermediary
  if (!migration.includes("paid_direct_vendor")) {
    errors.push("F1: migration must widen target_type CHECK with paid_direct_vendor");
  }
  if (!migration.includes("funding_account_id") || !migration.includes("intermediary_name")) {
    errors.push("F1: migration must add funding_account_id and intermediary_name columns");
  }
  if (!migration.includes("REFERENCES catalogs.accounts(id)")) {
    errors.push("F1: funding_account_id must FK to catalogs.accounts");
  }

  // F2 — create route: paid_direct → funding document_kind; refuse bank line; require debit account
  if (!routes.includes('"paid_direct_vendor"') && !routes.includes("'paid_direct_vendor'")) {
    errors.push("F2: routes TARGET_TYPES must include paid_direct_vendor");
  }
  if (!routes.includes("paid_direct_vendor_requires_funding_account")) {
    errors.push("F2: create must refuse paid_direct without funding_account_id");
  }
  if (!routes.includes("paid_direct_vendor_forbids_bank_transaction")) {
    errors.push("F2: create must refuse paid_direct with bank_transaction_id (0 bank rows)");
  }
  if (!routes.includes("paid_direct_vendor_requires_direction_in")) {
    errors.push("F2: create must require direction=in for paid_direct_vendor");
  }
  if (
    !routes.includes('b.target_type === "paid_direct_vendor"') &&
    !routes.includes("b.target_type === 'paid_direct_vendor'")
  ) {
    errors.push("F2: document_kind funding path must treat paid_direct_vendor as a funding advance");
  }
  if (!routes.includes("funding_account_id") || !routes.includes("intermediary_name")) {
    errors.push("F2: create INSERT must persist funding_account_id + intermediary_name");
  }

  // F3 — FE API contract
  if (!feApi.includes("paid_direct_vendor") || !feApi.includes("funding_account_id")) {
    errors.push("F3: related-party-loans API types must include paid_direct_vendor + funding_account_id");
  }

  // F4 — wizard: Paid directly to a vendor UI + no bank stamp
  if (!wizard.includes("isPaidDirectVendorTarget") || !wizard.includes("Paid directly to a vendor")) {
    errors.push("F4: wizard must expose isPaidDirectVendorTarget + Paid directly to a vendor label");
  }
  if (!wizard.includes("loan-wizard-paid-direct-fields") || !wizard.includes("loan-wizard-paid-direct-banner")) {
    errors.push("F4: wizard must render paid-direct banner + debit/intermediary fields");
  }
  if (!wizard.includes("funding_account_id") || !wizard.includes("intermediary_name")) {
    errors.push("F4: buildPayload must send funding_account_id + intermediary_name for paid-direct");
  }
  if (!wizard.includes("!paidDirect && bankTransactionId") && !wizard.includes("!paidDirect && bankTransactionId?.trim()")) {
    // Also accept the form we ship: if (!paidDirect && bankTransactionId?.trim())
    if (!wizard.includes("if (!paidDirect && bankTransactionId")) {
      errors.push("F4: paid-direct must never stamp bank_transaction_id on the create payload");
    }
  }

  // F5 — Finance Loans entry point
  if (!page.includes("loans-paid-direct-vendor-btn") || !page.includes('target_type: "paid_direct_vendor"')) {
    errors.push("F5: LoansAdvancesPage must offer Paid directly to a vendor that prefills paid_direct_vendor");
  }
  if (!page.includes("paid_direct_vendor")) {
    errors.push("F5: LoansAdvancesPage filter TARGETS must include paid_direct_vendor");
  }

  return errors;
}

function selftest() {
  const good = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const ok = staticProblems(good);
  if (ok.length) fail(["selftest expected PASS on live tree:", ...ok]);

  const broken = {
    ...good,
    routes: good.routes
      .replaceAll("paid_direct_vendor_requires_funding_account", "paid_direct_ok_without_funding")
      .replaceAll("paid_direct_vendor_forbids_bank_transaction", "paid_direct_allows_bank"),
  };
  const bad = staticProblems(broken);
  if (!bad.some((e) => e.startsWith("F2:"))) {
    fail(["selftest expected F2 failures when route refuses are stripped"]);
  }
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  for (const [k, rel] of Object.entries(FILES)) {
    if (!existsSync(join(ROOT, rel))) fail([`missing file (${k}): ${rel}`]);
  }
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = staticProblems(srcs);
  if (errors.length) fail(errors);
  console.log(`${LABEL} PASS`);
}

main();
