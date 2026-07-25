#!/usr/bin/env node
/**
 * LST-F14 — posting account pickers must request postable_only (server filters is_postable=true).
 *
 * CoA management / ChartOfAccountsListPage must NOT force postable_only (headers stay visible).
 * Defense-in-depth client filters are allowed but insufficient alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** Surfaces that choose a GL account for posting / money objects. */
const POSTING_PICKER_FILES = [
  "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
  "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
  "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx",
  "apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx",
  "apps/frontend/src/pages/VendorDetail.tsx",
  "apps/frontend/src/components/vendors/VendorCreateModal.tsx",
  "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
];

const BACKEND_ROUTES = "apps/backend/src/catalogs/accounts.routes.ts";
const COA_LIST = "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx";

export function run(root = ROOT) {
  const failures = [];

  const routes = fs.readFileSync(path.join(root, BACKEND_ROUTES), "utf8");
  if (!/if \(postable_only\) filters\.push\("is_postable = true"\)/.test(routes)) {
    failures.push(`${BACKEND_ROUTES}: GET list must filter is_postable=true when postable_only`);
  }

  for (const rel of POSTING_PICKER_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`${rel}: missing (posting picker file required)`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!/listCatalogAccounts\s*\(/.test(src) && !/listCoaAccountsForJe\s*\(/.test(src)) {
      failures.push(`${rel}: expected listCatalogAccounts / listCoaAccountsForJe call`);
      continue;
    }
    // Must pass postable_only: true (or listCoaAccountsForJe which defaults postable).
    const hasPostableOnly =
      /postable_only\s*:\s*true/.test(src) ||
      /listCoaAccountsForJe\([^)]*postableOnly\s*:\s*true/.test(src) ||
      /listCoaAccountsForJe\([^)]*\{[^}]*postableOnly/.test(src);
    // listCoaAccountsForJe defaults postableOnly !== false — bare call with company id is OK.
    const usesJeHelper = /listCoaAccountsForJe\s*\(/.test(src);
    if (!hasPostableOnly && !usesJeHelper) {
      failures.push(`${rel}: posting picker must pass postable_only: true (server-side is_postable filter)`);
    }
    // Ban the bug shape: listCatalogAccounts({...}) without postable_only in same call object.
    const calls = src.match(/listCatalogAccounts\s*\(\s*\{[^}]*\}\s*\)/gs) ?? [];
    for (const call of calls) {
      if (!/postable_only\s*:\s*true/.test(call)) {
        failures.push(`${rel}: listCatalogAccounts call missing postable_only: true — ${call.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
  }

  // CoA management must remain unfiltered (headers visible).
  if (fs.existsSync(path.join(root, COA_LIST))) {
    const coa = fs.readFileSync(path.join(root, COA_LIST), "utf8");
    if (/postable_only\s*:\s*true/.test(coa)) {
      failures.push(`${COA_LIST}: CoA management must NOT force postable_only (headers must remain visible)`);
    }
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-account-pickers-postable-");
  const write = (rel, body) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  write(
    BACKEND_ROUTES,
    `if (postable_only) filters.push("is_postable = true");\n`
  );
  for (const rel of POSTING_PICKER_FILES) {
    write(rel, `listCatalogAccounts({ status: "active", operating_company_id: id, postable_only: true })\n`);
  }
  write(COA_LIST, `listCatalogAccounts({ status: "active" })\n`);
  const ok = run(tmp);
  if (ok.length) {
    console.error("selftest PASS shape unexpectedly failed:\n", ok.join("\n"));
    process.exit(1);
  }
  // Bug shape: drop postable_only from one posting picker.
  write(
    POSTING_PICKER_FILES[0],
    `listCatalogAccounts({ status: "active", operating_company_id: id })\n`
  );
  const bad = run(tmp);
  if (!bad.length) {
    console.error("selftest FAIL shape unexpectedly passed");
    process.exit(1);
  }
  console.log("selftest OK");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error(`[verify-account-pickers-postable-only] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[verify-account-pickers-postable-only] OK");
}
