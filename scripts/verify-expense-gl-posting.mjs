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
  // THE SOURCE-TYPE VOCABULARY — read from wherever it is declared, but read ONLY that declaration.
  //
  // This used to be /PostingSourceType =[^;]*"expense"/, which assumed the vocabulary was spelled as an
  // inline union. It is now a const array (POSTING_SOURCE_TYPES) with the type derived from it, so the
  // old pattern went red against a posting engine that handles 'expense' perfectly well. A guard that
  // fails on correct code is not a safe guard: the reflex is to delete it, and then the real defect it
  // was written for ships unnoticed. Both spellings are accepted; neither is a free pass, because the
  // literal must appear INSIDE the extracted declaration, not merely somewhere in the file.
  const vocabArray = /export\s+const\s+POSTING_SOURCE_TYPES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/.exec(engine);
  const vocabUnion = /type\s+PostingSourceType\s*=([^;]*)/.exec(engine);
  const vocabulary = vocabArray ? vocabArray[1] : vocabUnion ? vocabUnion[1] : null;
  if (vocabulary == null) {
    fail("no posting source-type vocabulary found (POSTING_SOURCE_TYPES array or PostingSourceType union).");
  } else if (!/"expense"/.test(vocabulary)) {
    fail("the posting source-type vocabulary must include \"expense\".");
  }

  // The runtime check must validate against that SAME vocabulary. Previously this was
  // /assertKnownSourceType[\s\S]*?"expense"/ — a lazy scan across the rest of the file, so any later
  // mention of "expense" anywhere satisfied it even if the runtime list had dropped the value. Now it
  // must reference the vocabulary the type is derived from, which is what makes them impossible to
  // diverge: a source type accepted by the compiler but rejected at runtime throws on a live post.
  const assertFn = /function assertKnownSourceType[\s\S]*?\n\}/.exec(engine);
  if (!assertFn) fail("assertKnownSourceType must exist (runtime source-type validation).");
  else if (!/POSTING_SOURCE_TYPES/.test(assertFn[0]) && !/"expense"/.test(assertFn[0])) {
    fail("assertKnownSourceType must validate against POSTING_SOURCE_TYPES (or list \"expense\" explicitly).");
  }
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
