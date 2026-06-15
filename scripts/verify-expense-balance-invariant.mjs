#!/usr/bin/env node
/**
 * Static guard for GAP-EXPENSES Phase 1.5 — locks the "balances or fails hard" gate so it
 * cannot silently regress:
 *
 *  Migration 202606151400:
 *   - adds `amount_cents bigint` to accounting.expense_lines
 *   - the invariant gates on posting_status='posted' (GL state), NOT status='posted'
 *     (the route writes status='posted' on every expense → gating there breaks the live route)
 *   - deferred constraint triggers (DEFERRABLE INITIALLY DEFERRED) on BOTH tables
 *   - the header-side trigger covers INSERT (closes the one-shot line-less-posted hole)
 *
 *  Writer (two-section-service.ts), expense branch:
 *   - writes amount_cents into accounting.expense_lines
 *   - reconciles the parent total_amount_cents = SUM(amount_cents)
 *
 * Pure file-content checks — no DB. Safe in CI.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202606151400_expense_lines_cents_and_balance_invariant.sql";
const WRITER = "apps/backend/src/maintenance/two-section-service.ts";

let failed = 0;
const fail = (m) => { console.error(`verify-expense-balance-invariant: ${m}`); failed = 1; };
const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { fail(`expected file missing: ${rel}`); return ""; }
  return fs.readFileSync(p, "utf8");
};

const mig = read(MIGRATION);
if (mig) {
  if (!/amount_cents\s+bigint/i.test(mig)) fail(`${MIGRATION} must add expense_lines.amount_cents bigint.`);
  // gate must be posting_status, not status
  if (!/posting_status\s+IS\s+DISTINCT\s+FROM\s+'posted'/i.test(mig))
    fail(`${MIGRATION} invariant must gate on posting_status (IS DISTINCT FROM 'posted'), not status.`);
  if (/\bstatus\s+IS\s+DISTINCT\s+FROM\s+'posted'/i.test(mig))
    fail(`${MIGRATION} must NOT gate on status='posted' (route writes status='posted' on every expense → would break the live route).`);
  // deferred constraint triggers on both tables
  const deferred = (mig.match(/DEFERRABLE\s+INITIALLY\s+DEFERRED/gi) || []).length;
  if (deferred < 2) fail(`${MIGRATION} must define 2 deferred constraint triggers (got ${deferred}).`);
  if (!/CONSTRAINT TRIGGER[\s\S]*ON accounting\.expense_lines/i.test(mig))
    fail(`${MIGRATION} must put a constraint trigger on accounting.expense_lines.`);
  if (!/CONSTRAINT TRIGGER[\s\S]*ON accounting\.expenses\b/i.test(mig))
    fail(`${MIGRATION} must put a constraint trigger on accounting.expenses.`);
  // header trigger must cover INSERT (one-shot line-less-posted hole)
  if (!/AFTER INSERT OR UPDATE OF[^\n]*ON accounting\.expenses/i.test(mig))
    fail(`${MIGRATION} header trigger must fire on INSERT OR UPDATE OF ... (INSERT coverage closes the one-shot line-less-posted hole).`);
}

const writer = read(WRITER);
if (writer) {
  if (!/INSERT INTO accounting\.expense_lines[\s\S]*amount_cents/i.test(writer))
    fail(`${WRITER} expense branch must write amount_cents into accounting.expense_lines.`);
  if (!/UPDATE accounting\.expenses[\s\S]*total_amount_cents\s*=\s*COALESCE[\s\S]*SUM\(amount_cents\)/i.test(writer))
    fail(`${WRITER} must reconcile accounting.expenses.total_amount_cents = SUM(amount_cents) after writing expense lines.`);
}

if (failed) process.exit(1);
console.log("verify-expense-balance-invariant: OK — posting_status gate + deferred triggers (both tables, INSERT-covered) + writer cents reconciliation locked.");
