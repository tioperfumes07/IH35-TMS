#!/usr/bin/env node
/**
 * B-1 ACCOUNT REGISTER (ORDERS-2026-10-01-BANKING-REGISTER-SET) — structural guard.
 * Asserts QBO-shaped register: two-line rows, Bank vs Ending header, ✓ blank/C/R,
 * page size 100, inline expand → original document, CoA Book balance label.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b1-account-register";

const PAGE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";
const SERVICE = "apps/backend/src/accounting/account-register.service.ts";
const API = "apps/frontend/src/api/account-register.ts";
const COA = "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const page = read(PAGE);
  const service = read(SERVICE);
  const api = read(API);
  const coa = read(COA);

  assertIncludes(page, 'data-b1-two-line="1"', PAGE);
  assertIncludes(page, "Bank balance", PAGE);
  assertIncludes(page, "Ending balance", PAGE);
  assertIncludes(page, "Reconciled through", PAGE);
  assertIncludes(page, "initialPageSize={100}", PAGE);
  assertIncludes(page, "renderExpanded", PAGE);
  assertIncludes(page, "toggleAccountRegisterCleared", PAGE);
  assertIncludes(page, 'data-testid="b1-reconcile-toggle"', PAGE);
  assertIncludes(page, "Unmatch this row in Bank Transactions first", PAGE);
  assertIncludes(page, "RegisterInlineEditPanel", PAGE);
  assertIncludes(page, "expandOnRowClick", PAGE);
  assertIncludes(page, 'label: "C/R"', PAGE);
  assertIncludes(page, '"n/a"', PAGE);
  assertIncludes(page, "Bank transactions", PAGE);
  assertIncludes(page, "Reconcile", PAGE);
  assertIncludes(page, "/banking/transfers?transfer_id=", PAGE);
  assertIncludes(page, "/accounting/journal-entries/${journalEntryId}", PAGE);

  const inlinePanel = read("apps/frontend/src/pages/accounting/RegisterInlineEditPanel.tsx");
  assertIncludes(inlinePanel, 'data-testid="b1-register-edit-original"', "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, 'data-testid="b1-register-save"', "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, 'data-testid="b1-register-cancel"', "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, 'data-testid="b1-register-delete"', "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, 'data-testid="b1-inline-attachments"', "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, "saveAccountRegisterInline", "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, "voidExpense", "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, "UploadZone", "RegisterInlineEditPanel");
  assertIncludes(inlinePanel, "onUploaded", "RegisterInlineEditPanel");

  assertIncludes(service, "reconcile_status", SERVICE);
  assertIncludes(service, "attachment_count", SERVICE);
  assertIncludes(service, "bank_balance_cents", SERVICE);
  assertIncludes(service, "reconciled_through", SERVICE);
  assertIncludes(service, "reconciliation_sessions", SERVICE);
  assertIncludes(service, "toggleAccountRegisterCleared", SERVICE);
  assertIncludes(service, "register_cleared", SERVICE);
  assertIncludes(service, "categorization_location", SERVICE);
  assertIncludes(service, "saveAccountRegisterInline", SERVICE);
  assertIncludes(service, "open_original_document", SERVICE);

  assertIncludes(api, "reconcile_status", API);
  assertIncludes(api, "bank_balance_cents", API);
  assertIncludes(api, "attachment_count", API);
  assertIncludes(api, "toggleAccountRegisterCleared", API);
  assertIncludes(api, "toggle-cleared", API);
  assertIncludes(api, "saveAccountRegisterInline", API);
  assertIncludes(api, "inline-save", API);

  const routes = read("apps/backend/src/accounting/account-register.routes.ts");
  assertIncludes(routes, "/api/v1/accounting/account-register/toggle-cleared", "account-register.routes.ts");
  assertIncludes(routes, "/api/v1/accounting/account-register/inline-save", "account-register.routes.ts");

  const migration = read("db/migrations/202615201200_journal_entry_postings_register_cleared.sql");
  assertIncludes(migration, "register_cleared", "202615201200 migration");

  assertIncludes(coa, "BOOK BALANCE", COA);
  if (coa.includes("QUICKBOOKS BALANCE")) {
    throw new Error(`${COA}: must not label book column QUICKBOOKS BALANCE (B-1 Book balance)`);
  }

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
    console.log(`${LABEL} --selftest PASS`);
  } catch (e) {
    console.error(`${LABEL} --selftest FAIL`, e);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest") || !process.argv.includes("--check-only")) {
  selftest();
}
