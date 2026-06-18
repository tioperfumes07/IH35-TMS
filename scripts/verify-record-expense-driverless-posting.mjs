#!/usr/bin/env node
// Guard — Record-Expense driverless categorized GL posting (P-NOW, #3). Locks the invariants so they
// can't silently regress:
//   1. Migration makes driver_uuid optional + adds the direct GL account on the expense line.
//   2. The posting engine PREFERS the line's direct account (so a categorized expense debits the real
//      category, not "Uncategorized").
//   3. The create route resolves the QBO category ENTITY-SCOPED and REJECTS an unbridged account
//      (honest CoA-gap, never silent miscategorization), enforces the driverless guardrails, and posts
//      only behind the EXPENSE_GL_POSTING_ENABLED flag.
//   4. The QBO Purchase line AccountRef is sourced from the expense line's category account.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-record-expense-driverless-posting: ${m}`); process.exit(1); };

// 1) Migration
const mig = read("db/migrations/202606181400_expenses_driverless_category_posting.sql");
if (!/ALTER COLUMN driver_uuid DROP NOT NULL/.test(mig)) fail("migration must make accounting.expenses.driver_uuid nullable");
if (!/expense_lines\s+ADD COLUMN IF NOT EXISTS expense_account_uuid uuid REFERENCES catalogs\.accounts\(id\)/.test(mig))
  fail("migration must add expense_lines.expense_account_uuid REFERENCES catalogs.accounts(id)");

// 2) Engine prefers the direct line account
const engine = read("apps/backend/src/accounting/posting-engine.service.ts");
if (!/expense_account_uuid::text/.test(engine)) fail("buildExpenseLines must SELECT expense_account_uuid");
if (!/row\.expense_account_uuid[\s\S]{0,120}line_direct_account/.test(engine))
  fail("buildExpenseLines must prefer the line's direct expense_account_uuid (method 'line_direct_account')");

// 3) Create route: entity-scoped resolve + reject unbridged + driverless guardrails + flag-gated post
const route = read("apps/backend/src/accounting/expenses.routes.ts");
if (!/FROM\s+catalogs\.accounts[\s\S]{0,160}qbo_account_id\s*=\s*\$1[\s\S]{0,160}operating_company_id\s*=\s*\$2/.test(route))
  fail("route must resolve category_qbo_id -> catalogs.accounts scoped by operating_company_id");
if (!/category_not_in_ledger_chart/.test(route)) fail("route must reject an unbridged category (category_not_in_ledger_chart)");
if (!/category_required_for_driverless_expense/.test(route)) fail("route must require a category for a driverless expense");
if (!/payment_account_required_for_driverless_expense/.test(route)) fail("route must require a payment account for a driverless expense");
if (!/EXPENSE_GL_POSTING_FLAG_KEY[\s\S]{0,400}postSourceTransaction\(/.test(route))
  fail("create-time posting must stay gated behind EXPENSE_GL_POSTING_ENABLED and go through postSourceTransaction");

// 4) QBO sync sources the line AccountRef from the category account
const sync = read("apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts");
if (!/expense_account_uuid[\s\S]{0,200}resolveAccountQboId/.test(sync))
  fail("QBO expense sync must source the line AccountRef from the expense line's category account (expense_account_uuid)");

console.log("PASS verify-record-expense-driverless-posting (driver optional, line-direct GL debit, entity-scoped category, reject-unbridged, flag-gated post, QBO category AccountRef)");
