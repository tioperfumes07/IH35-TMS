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
  assertIncludes(page, "b1-register-edit-original", PAGE);
  assertIncludes(page, 'label: "C/R"', PAGE);
  assertIncludes(page, '"n/a"', PAGE);
  assertIncludes(page, "Bank transactions", PAGE);
  assertIncludes(page, "Reconcile", PAGE);

  assertIncludes(service, "reconcile_status", SERVICE);
  assertIncludes(service, "attachment_count", SERVICE);
  assertIncludes(service, "bank_balance_cents", SERVICE);
  assertIncludes(service, "reconciled_through", SERVICE);
  assertIncludes(service, "reconciliation_sessions", SERVICE);

  assertIncludes(api, "reconcile_status", API);
  assertIncludes(api, "bank_balance_cents", API);
  assertIncludes(api, "attachment_count", API);

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
