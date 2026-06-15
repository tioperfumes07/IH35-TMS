#!/usr/bin/env node
/**
 * Static guard for GAP-EXPENSES Phase 2 Step 3 (expense → GL posting). Locks:
 *  - 'expense' is wired into PostingSourceType, the runtime assertKnownSourceType list, and the dispatcher.
 *  - buildExpenseLines exists, credits payment_account_uuid (cash-basis primary), and has the orphan guard.
 *  - the Post-to-GL action is gated by EXPENSE_GL_POSTING_ENABLED and restricted to Owner+Accountant (canVoid).
 *  - migration 202606151700 registers EXPENSE_GL_POSTING_ENABLED default OFF.
 * Pure file-content; no DB.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
let failed = 0;
const fail = (m) => { console.error(`verify-expense-gl-posting: ${m}`); failed = 1; };
const read = (rel) => { const p = path.join(ROOT, rel); if (!fs.existsSync(p)) { fail(`missing: ${rel}`); return ""; } return fs.readFileSync(p, "utf8"); };

const engine = read("apps/backend/src/accounting/posting-engine.service.ts");
if (engine) {
  if (!/PostingSourceType =[^;]*"expense"/s.test(engine)) fail("PostingSourceType must include \"expense\".");
  if (!/assertKnownSourceType[\s\S]*?"expense"/.test(engine)) fail("runtime assertKnownSourceType list must include \"expense\".");
  if (!/sourceType === "expense"\)\s*return buildExpenseLines/.test(engine)) fail("buildPostingDraft must dispatch 'expense' → buildExpenseLines.");
  if (!/async function buildExpenseLines\(/.test(engine)) fail("buildExpenseLines must exist.");
  if (!/exp\.payment_account_uuid/.test(engine)) fail("buildExpenseLines must credit payment_account_uuid (cash-basis primary).");
  if (!/no orphan payable/i.test(engine)) fail("buildExpenseLines must have the orphan guard (no payment account AND no vendor → fail loud).");
}

const routes = read("apps/backend/src/accounting/expenses.routes.ts");
if (routes) {
  if (!/EXPENSE_GL_POSTING_FLAG_KEY|"EXPENSE_GL_POSTING_ENABLED"/.test(routes)) fail("post action must be gated by EXPENSE_GL_POSTING_ENABLED.");
  if (!/expenses\/:expenseId\/post/.test(routes)) fail("explicit POST /expenses/:expenseId/post action must exist (not auto-post).");
  if (!/canVoid\(/.test(routes)) fail("post/void must be restricted to Owner+Accountant (canVoid).");
  if (!/reversePostedSourceTransaction/.test(routes)) fail("void must produce a reversing JE (reversePostedSourceTransaction).");
}

const mig = read("db/migrations/202606151700_expense_gl_posting_flag.sql");
if (mig && !/'EXPENSE_GL_POSTING_ENABLED'[\s\S]*false/.test(mig)) fail("migration must register EXPENSE_GL_POSTING_ENABLED default OFF.");

if (failed) process.exit(1);
console.log("verify-expense-gl-posting: OK — expense source + buildExpenseLines (cash CR + orphan guard) + gated Post action + reversing-JE void + flag(OFF) locked.");
