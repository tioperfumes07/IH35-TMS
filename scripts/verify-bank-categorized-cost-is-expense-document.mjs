#!/usr/bin/env node
/**
 * GUARD (ROUND 441.5 Phase 1): a money-OUT bank line categorized to an expense / cost account is an EXPENSE DOCUMENT,
 * linked to the line both ways — never a bare journal entry. Owner, 2026-10-07: "ours should work exactly as quickbooks."
 *
 * Measured 2026-10-07: the categorize poster wrote every categorized line as a bare bank_categorization JE. Five USMCA
 * cost lines ($203.14 on 6300 / 6310 / 6900) had no expense document and no payee on the books.
 *
 * STATIC (always runs):
 *   S1 postBankCategorizationOnClient sends money_out + an EXPENSE_DOCUMENT_ACCOUNT_TYPES account to the expense path
 *      BEFORE any bank_categorization posting
 *   S2 EXPENSE_DOCUMENT_ACCOUNT_TYPES = Expense, CostOfGoodsSold, OtherExpense
 *   S3 the expense path creates the document with sourceBankTransactionId and stamps matched_expense_id +
 *      matched_journal_entry_id on the line
 *   S4 the writer posts through postSourceTransactionInClientTx 'expense' (no hand-written JE) and records the operator
 *   S5 Undo of the line voids the expense it created (voidDocumentsCreatedByLine reads accounting.expenses)
 *   S6 voiding the expense releases the line (void.service BANK_MATCH_REVERSE_TABLE expense)
 * LIVE (with DATABASE_URL), USMCA:
 *   L1 no live bank_categorization JE on a money-out line debits an Expense / COGS / Other Expense account
 *   L2 every live expense with source_bank_transaction_id is named back by that line (matched_expense_id) and the line's
 *      matched_journal_entry_id is the expense's own entry
 *   L3 that entry balances
 *   L4 it debits the line's chosen category for the line's amount
 *   L5 it credits the bank account's ledger account for the line's amount
 *   L6 the expense records the operator (created_by_user_id)
 *
 * Run: node scripts/verify-bank-categorized-cost-is-expense-document.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-categorized-cost-is-expense-document";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// verify-no-silent-db-skip (03d): the static rules S1–S6 always run and fail closed; the live rules run whenever
// DATABASE_URL is set, and the OK line says "static only" when they did not.
export const ALLOW_OFFLINE_SKIP = "static S1–S6 always run and fail closed; live L1–L6 run whenever DATABASE_URL is set";

export const FILES = {
  poster: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
  writer: "apps/backend/src/accounting/bank-line-expense.service.ts",
  undo: "apps/backend/src/banking/bank-line-state-machine.service.ts",
  void: "apps/backend/src/accounting/void.service.ts",
};

function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return "";
  const next = src.slice(i + 1).search(/\n(?:export )?(?:async )?function /);
  return next < 0 ? src.slice(i) : src.slice(i, i + 1 + next);
}

export function staticProblems(src) {
  const p = [];
  const poster = fnBody(src.poster, "postBankCategorizationOnClient");
  const branch = poster.search(/decision\.direction === "money_out" && EXPENSE_DOCUMENT_ACCOUNT_TYPES\.has\(/);
  const bare = poster.indexOf('source_transaction_type: "bank_categorization"');
  if (branch < 0 || bare < 0 || branch > bare || !/return postBankLineAsExpenseOnClient\(/.test(poster)) {
    p.push("S1: postBankCategorizationOnClient does not send money-out expense categorizations to the expense document before the bare bank_categorization entry");
  }
  const types = src.poster.match(/EXPENSE_DOCUMENT_ACCOUNT_TYPES[^=]*=\s*new Set\(\[([^\]]*)\]\)/);
  const set = new Set((types?.[1] ?? "").match(/"([A-Za-z]+)"/g)?.map((x) => x.replace(/"/g, "")) ?? []);
  if (!["Expense", "CostOfGoodsSold", "OtherExpense"].every((t) => set.has(t))) {
    p.push("S2: EXPENSE_DOCUMENT_ACCOUNT_TYPES must hold Expense, CostOfGoodsSold and OtherExpense");
  }
  const path_ = fnBody(src.poster, "postBankLineAsExpenseOnClient");
  if (!/createAndPostBankLineExpenseOnClient\(/.test(path_) || !/sourceBankTransactionId: input\.bankTransactionId/.test(path_) ||
      !/SET matched_expense_id = \$1::uuid,\s*matched_journal_entry_id = \$2::uuid/.test(path_)) {
    p.push("S3: the expense path must create the document with sourceBankTransactionId and stamp matched_expense_id + matched_journal_entry_id on the line");
  }
  const writer = fnBody(src.writer, "createAndPostBankLineExpenseOnClient");
  if (!/postSourceTransactionInClientTx\(/.test(writer) || !/source_transaction_type: "expense"/.test(writer) ||
      /INSERT INTO accounting\.journal_entr/.test(writer) || !/created_by_user_id/.test(writer)) {
    p.push("S4: the writer must post through postSourceTransactionInClientTx 'expense' (no hand-written JE) and record created_by_user_id");
  }
  const undo = fnBody(src.undo, "voidDocumentsCreatedByLine");
  if (!/FROM accounting\.expenses\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid/.test(undo)) {
    p.push("S5: Undo of the line must void the expense it created (voidDocumentsCreatedByLine reads accounting.expenses by source_bank_transaction_id)");
  }
  if (!/BANK_MATCH_REVERSE_TABLE[\s\S]{0,400}expense:\s*"accounting\.expenses"/.test(src.void)) {
    p.push("S6: voiding the expense must release the line (void.service BANK_MATCH_REVERSE_TABLE expense)");
  }
  return p;
}

async function liveProblems(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const p = [];
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const l1 = await c.query(
      `SELECT DISTINCT je.id::text AS je, a.account_number
         FROM accounting.journal_entries je
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.source_transaction_type = 'bank_categorization'
         JOIN banking.bank_transactions bt ON bt.id::text = p.source_transaction_id AND bt.operating_company_id = je.operating_company_id
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.voided_at IS NULL
          AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
          AND bt.is_credit = false AND p.debit_or_credit = 'debit'
          AND a.account_type IN ('Expense', 'CostOfGoodsSold', 'OtherExpense')`,
      [USMCA]
    );
    for (const r of l1.rows) p.push(`L1: bare categorization entry ${r.je} debits expense account ${r.account_number} with no expense document`);
    const col = await c.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'source_bank_transaction_id'`
    );
    if (col.rows.length === 0) {
      await c.query("ROLLBACK");
      p.push("L2–L6: accounting.expenses.source_bank_transaction_id does not exist here — migration 202615440500 is not applied, so no expense can name its bank line");
      return p;
    }
    const docs = await c.query(
      `SELECT e.id::text AS expense_id, e.journal_entry_id::text AS je, e.created_by_user_id::text AS operator,
              bt.id::text AS bt, bt.matched_expense_id::text AS bt_expense, bt.matched_journal_entry_id::text AS bt_je,
              abs(bt.amount_cents)::bigint AS amount, bt.categorization_gl_account_id::text AS cat, ba.ledger_account_id::text AS bank_gl,
              (SELECT COALESCE(sum(CASE WHEN q.debit_or_credit='debit' THEN q.amount_cents ELSE -q.amount_cents END),0)
                 FROM accounting.journal_entry_postings q WHERE q.journal_entry_uuid = e.journal_entry_id)::bigint AS net,
              (SELECT COALESCE(sum(q.amount_cents),0) FROM accounting.journal_entry_postings q
                WHERE q.journal_entry_uuid = e.journal_entry_id AND q.debit_or_credit='debit' AND q.account_id = bt.categorization_gl_account_id)::bigint AS dr_cat,
              (SELECT COALESCE(sum(q.amount_cents),0) FROM accounting.journal_entry_postings q
                WHERE q.journal_entry_uuid = e.journal_entry_id AND q.debit_or_credit='credit' AND q.account_id = ba.ledger_account_id)::bigint AS cr_bank
         FROM accounting.expenses e
         JOIN banking.bank_transactions bt ON bt.id = e.source_bank_transaction_id
         LEFT JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id AND ba.operating_company_id = bt.operating_company_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.source_bank_transaction_id IS NOT NULL`,
      [USMCA]
    );
    await c.query("ROLLBACK");
    for (const d of docs.rows) p.push(...linkageProblems(d));
  } finally {
    await c.end();
  }
  return p;
}

/** L2–L6 for one expense row (exported for the selftest). */
export function linkageProblems(d) {
  const p = [];
  if (d.bt_expense !== d.expense_id || d.bt_je !== d.je) p.push(`L2: expense ${d.expense_id} and bank line ${d.bt} do not name each other (line → ${d.bt_expense}/${d.bt_je})`);
  if (Number(d.net) !== 0) p.push(`L3: expense ${d.expense_id} entry does not balance (net ${d.net})`);
  if (Number(d.dr_cat) !== Number(d.amount)) p.push(`L4: expense ${d.expense_id} entry does not debit the chosen category for ${d.amount} (debited ${d.dr_cat})`);
  if (Number(d.cr_bank) !== Number(d.amount)) p.push(`L5: expense ${d.expense_id} entry does not credit the bank account for ${d.amount} (credited ${d.cr_bank})`);
  if (!d.operator) p.push(`L6: expense ${d.expense_id} records no operator`);
  return p;
}

function readSources(root = ROOT) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

const src = readSources();

if (process.argv.includes("--selftest")) {
  const real = staticProblems(src);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  const plant = (key, from, to) => ({ ...src, [key]: src[key].replace(from, to) });
  const good = { expense_id: "e", je: "j", operator: "u", bt: "b", bt_expense: "e", bt_je: "j", amount: 1000, net: 0, dr_cat: 1000, cr_bank: 1000 };
  const cases = [
    ["S1", staticProblems(plant("poster", 'decision.direction === "money_out" && EXPENSE_DOCUMENT_ACCOUNT_TYPES.has(', 'false && EXPENSE_DOCUMENT_ACCOUNT_TYPES.has('))],
    ["S2", staticProblems(plant("poster", '"CostOfGoodsSold", ', ""))],
    ["S3", staticProblems(plant("poster", "SET matched_expense_id = $1::uuid,", "SET reviewed_note = $1::text,"))],
    ["S4", staticProblems(plant("writer", 'source_transaction_type: "expense"', 'source_transaction_type: "journal_entry"'))],
    ["S5", staticProblems(plant("undo", "SELECT 'expense', id::text FROM accounting.expenses", "SELECT 'expense', id::text FROM accounting.bills"))],
    ["S6", staticProblems(plant("void", 'expense: "accounting.expenses"', ""))],
    ["L2", linkageProblems({ ...good, bt_expense: null })],
    ["L3", linkageProblems({ ...good, net: 5 })],
    ["L4", linkageProblems({ ...good, dr_cat: 0 })],
    ["L5", linkageProblems({ ...good, cr_bank: 999 })],
    ["L6", linkageProblems({ ...good, operator: null })],
  ];
  const clean = linkageProblems(good);
  const missed = cases.filter(([rule, probs]) => !probs.some((x) => x.startsWith(rule))).map(([r]) => r);
  if (missed.length || clean.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join(", ")}${clean.length ? `; clean row flagged: ${clean.join("; ")}` : ""}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${cases.length}/${cases.length} rules proven able to fail (S1–S6, L2–L6)`);
  process.exit(0);
}

const problems = staticProblems(src);
const url = process.env.DATABASE_URL;
if (url) problems.push(...(await liveProblems(url)));
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — money-out cost categorizations are expense documents linked both ways${url ? "; live L1–L6 clean" : " (static only — no DATABASE_URL)"}`);
