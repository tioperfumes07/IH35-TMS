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
  // B-1 ORDERS filter — full document-type list mapped to source_transaction_type (Journal Entry was missing)
  assertIncludes(page, '"Journal Entry": "journal_entry"', PAGE);
  assertIncludes(page, 'Deposit: "bank_deposit"', PAGE);
  assertIncludes(page, '"Factoring Advance": "factoring_advance"', PAGE);
  assertIncludes(page, "Bank Categorization", PAGE);
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
  assertIncludes(page, 't === "bank_deposit"', PAGE);
  assertIncludes(page, "/banking/deposits/${reference}", PAGE);
  // B-1 leftovers: LOCATION under PAYEE · factoring_advance Edit hop · CoA View register for P&L
  assertIncludes(page, "r.location?.trim() || \"—\"", PAGE);
  assertIncludes(page, 't === "factoring_advance"', PAGE);
  assertIncludes(page, "/factoring/advances/${reference}", PAGE);
  // B-1 leftovers: cash/driver advance Edit hop + Check (expense payment_type) Edit hop
  assertIncludes(page, 't === "cash_advance" || t === "driver_advance"', PAGE);
  assertIncludes(page, "/cash-advances?advance_id=${reference}", PAGE);
  assertIncludes(page, 'Check: "check"', PAGE);
  assertIncludes(page, '(expensePaymentType ?? "").toLowerCase() === "check"', PAGE);
  assertIncludes(page, "/accounting/checks/${reference}", PAGE);
  assertIncludes(page, "r.expense_payment_type", PAGE);
  // B-1 ORDERS filter chip set: status / type / date / payee (date = period From/To already)
  assertIncludes(page, 'data-b1-filter-payee="1"', PAGE);
  assertIncludes(page, 'data-b1-filter-status="1"', PAGE);
  assertIncludes(page, "payeeFilter", PAGE);
  assertIncludes(page, "statusFilter", PAGE);
  assertIncludes(page, "filteredRows", PAGE);
  assertIncludes(page, "printList", PAGE);
  // BANK-F91053 — ORDERS §B-1 gear (column chooser) beside Export/Print; Memo/Type/Account/Location
  // stay defaultHidden so the ParityTable gear has real columns to toggle.
  assertIncludes(page, 'gearButtonTestId="b1-account-register-gear"', PAGE);
  assertIncludes(page, 'defaultHidden: true', PAGE);
  assertIncludes(page, 'key: "memo"', PAGE);
  assertIncludes(page, 'key: "type"', PAGE);
  assertIncludes(page, 'key: "split_account"', PAGE);
  // BANK-F91054 — ORDERS §B-1 print / export / gear trio + Bank transactions / Reconcile hops named.
  assertIncludes(page, 'data-testid="b1-account-register-export"', PAGE);
  assertIncludes(page, 'data-testid="b1-account-register-print"', PAGE);
  assertIncludes(page, 'data-testid="b1-account-register-bank-transactions"', PAGE);
  assertIncludes(page, 'data-testid="b1-account-register-reconcile"', PAGE);
  // Visible ORDERS labels (children of the named buttons) — not the longer title= tooltips.
  if (!/>\s*Export\s*</.test(page)) throw new Error(`${PAGE}: Export button must render label "Export"`);
  if (!/>\s*Print\s*</.test(page)) throw new Error(`${PAGE}: Print button must render label "Print"`);
  // BANK-F91044 — ORDERS §B-1 "Go to page N of M" via shared ParityTable pager label
  const parityTable = read("apps/frontend/src/components/parity/ParityTable.tsx");
  assertIncludes(parityTable, 'data-parity-goto-page="1"', "ParityTable.tsx");
  assertIncludes(parityTable, "Go to page", "ParityTable.tsx");
  assertIncludes(parityTable, 'aria-label="Go to page"', "ParityTable.tsx");
  assertIncludes(parityTable, "gearButtonTestId", "ParityTable.tsx");
  // Print must honor the same payee/status filter as the on-screen table (BANK-F91012 follow-on).
  if (!/const rowsHtml = filteredRows/.test(page)) {
    throw new Error(`${PAGE}: printList must map filteredRows (not report.rows)`);
  }
  assertIncludes(coa, 'data-b1-coa-actions="1"', COA);
  if (!/View register/.test(coa) || !/row\.statement === ["']P&L["']/.test(coa)) {
    throw new Error(`${COA}: P&L rows must keep Run report AND always expose View register (ORDERS §B-1)`);
  }
  // BANK-F91046 — ORDERS §B-1 / QBO §11 Action [View register ▾]
  assertIncludes(coa, 'data-b1-coa-view-register-menu="1"', COA);
  assertIncludes(coa, 'data-testid="b1-coa-view-register-menu"', COA);
  assertIncludes(coa, "MoreActionsMenu", COA);
  assertIncludes(coa, 'label: "Edit"', COA);
  assertIncludes(coa, 'label: "Make inactive"', COA);
  assertIncludes(coa, 'label: "Run report"', COA);
  assertIncludes(coa, 'aria-label="Account actions"', COA);
  // BANK-F91047 — ORDERS §B-1 / QBO §11 [New account ▾]
  assertIncludes(coa, 'data-b1-coa-new-account="1"', COA);
  assertIncludes(coa, 'data-testid="b1-coa-new-account"', COA);
  assertIncludes(coa, "New account", COA);
  assertIncludes(coa, 'label: "Run report"', COA);
  assertIncludes(coa, 'aria-label="New account options"', COA);
  // BANK-F91028 — per-row Make inactive (ORDERS §B-1 CoA actions)
  assertIncludes(coa, 'data-testid="b1-coa-make-inactive"', COA);
  assertIncludes(coa, "Make inactive", COA);
  assertIncludes(coa, "deactivateCatalogAccount", COA);
  // BANK-F91030 — Type (+feed badge) when bank feed connected (ORDERS §B-1 / QBO §11)
  assertIncludes(coa, 'data-b1-coa-type="1"', COA);
  assertIncludes(coa, 'data-b1-coa-feed-badge="1"', COA);
  assertIncludes(coa, "Feed · BAL", COA);
  assertIncludes(coa, "row.feed_connected", COA);

  const coaUtils = read("apps/frontend/src/pages/lists/accounting/coa-list-utils.ts");
  assertIncludes(coaUtils, "feed_connected", "coa-list-utils.ts");
  assertIncludes(coaUtils, "feed_connected: bankBalance !== \"—\"", "coa-list-utils.ts");
  // BANK-F91031 — Description column from catalog (ORDERS §B-1 / QBO §11)
  assertIncludes(coa, 'id: "description"', COA);
  assertIncludes(coa, 'label: "DESCRIPTION"', COA);
  assertIncludes(coa, 'data-b1-coa-description="1"', COA);
  assertIncludes(coa, 'savedViewsKey="coa-list-v2"', COA);
  assertIncludes(coaUtils, "description: (row.description ?? \"\").trim() || \"—\"", "coa-list-utils.ts");

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
  assertIncludes(service, "matched_invoice_id::text = p.source_transaction_id", SERVICE);
  assertIncludes(service, "matched_payment_id::text = p.source_transaction_id", SERVICE);
  assertIncludes(service, "matched_bill_payment_id::text = p.source_transaction_id", SERVICE);
  // BANK-F91025 — register ✓ from Faro wire + cash/driver advance bank match pointers
  assertIncludes(service, "matched_factoring_advance_id::text = p.source_transaction_id", SERVICE);
  assertIncludes(service, "matched_advance_id::text = p.source_transaction_id", SERVICE);
  assertIncludes(service, "p.source_transaction_type = 'factoring_advance'", SERVICE);
  assertIncludes(service, "p.source_transaction_type IN ('cash_advance', 'driver_advance')", SERVICE);
  assertIncludes(service, "bank_deposit: \"Deposit\"", SERVICE);
  assertIncludes(service, "source_transaction_type = 'bank_deposit'", SERVICE);
  assertIncludes(service, 'journal_entry: "Journal Entry"', SERVICE);
  assertIncludes(service, 'input.type === "journal_entry"', SERVICE);
  assertIncludes(service, "factoring_advance: \"Factoring Advance\"", SERVICE);
  assertIncludes(service, "expense_payment_type", SERVICE);
  assertIncludes(service, "input.type === \"check\"", SERVICE);
  assertIncludes(service, "ex.payment_type", SERVICE);
  assertIncludes(service, 'payment_type = \'check\'', SERVICE);
  // BANK-F91027 — Expense filter excludes Checks
  assertIncludes(service, 'input.type === "expense"', SERVICE);
  assertIncludes(service, "ex_non_chk", SERVICE);

  assertIncludes(api, "reconcile_status", API);
  assertIncludes(api, "bank_balance_cents", API);
  assertIncludes(api, "attachment_count", API);
  assertIncludes(api, "expense_payment_type", API);
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
