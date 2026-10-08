#!/usr/bin/env node
/**
 * GUARD (ROUND 441.19): bank-feed CATEGORIZE posts ONE journal entry per the CHAIN-05 matrix and never creates a document.
 *
 * Source of truth: docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md.
 *   Match      = link to an existing record, NO new entry.
 *   Categorize = a new journal entry (§10.2, "QBO's Match vs Categorize split").
 * Matrix (§3): money OUT → Dr the chosen account / Cr the bank (A expense, A′ asset, A″ liability, A‴ equity); money IN →
 * Dr the bank / Cr the chosen account (B income, B′ liability, B″ asset refund, equity contribution). The driver-advance row
 * (D) belongs to bank-driver-advance.service.ts; transfers (C) are not posted. ROUND 441.5 had categorize create Expense /
 * Deposit documents on top of this; 441.18/441.19 reverted it.
 *
 * STATIC (always runs), on apps/backend/src/banking/bank-feed-gl-posting.service.ts and the posting engine:
 *   M1 the categorize poster creates NO document (no expense / deposit / bill / check writer, no INSERT into those tables)
 *   M2 it posts source_transaction_type 'bank_categorization' through postSourceTransactionInClientTx (caller's client)
 *   M3 buildBankCategorizationLines puts the category on the debit side for money out and the credit side for money in, the
 *      bank on the opposite side, direction from is_credit only
 *   M4 every CHAIN-05 refusal exists (flag_off … already_matched_to_bill), plus the driver-advance cede and the A/R–A/P
 *      control refusal (§10.3)
 * LIVE (with DATABASE_URL), every live (posted, unreversed) bank_categorization entry of every NON-FROZEN company (the
 * frozen entities' bank accounts were repointed after their historic entries posted; their books are not edited):
 *   L1 money out: debits the line's chosen account and credits its bank's ledger account, each for the line's amount
 *   L2 money in:  debits the bank's ledger account and credits the chosen account, each for the line's amount
 *   L3 two lines only, balanced
 *   L4 never on an A/R or A/P control account
 *
 * Run: node scripts/verify-bank-categorize-posts-chain05-matrix.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_FROZEN_SQL } from "./lib/bank-feed-state-machine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-categorize-posts-chain05-matrix";
// verify-no-silent-db-skip (03d): M1–M4 always run and fail closed; L1–L4 run whenever DATABASE_URL is set, and the OK
// line says "static only" when they did not.
export const ALLOW_OFFLINE_SKIP = "static M1–M4 always run and fail closed; live L1–L4 run whenever DATABASE_URL is set";

export const FILES = {
  poster: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
  engine: "apps/backend/src/accounting/posting-engine.service.ts",
};

export const REFUSALS = [
  "flag_off", "bank_txn_not_found", "not_categorized", "no_account", "account_cross_entity", "account_not_postable",
  "bank_account_ledger_unlinked", "zero_amount", "already_posted", "is_transfer", "already_matched_to_bill",
  "driver_advance_branch", "account_is_ar_ap_control",
];

function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return "";
  const next = src.slice(i + 1).search(/\n(?:export )?(?:async )?function /);
  return next < 0 ? src.slice(i) : src.slice(i, i + 1 + next);
}

export function staticProblems(src) {
  const p = [];
  if (/createAndPostBankLine(Expense|Deposit)OnClient|createBill\(|createExpense\(|INSERT INTO accounting\.(expenses|expense_lines|deposits|deposit_lines|bills|bill_payments|checks)\b/.test(src.poster)) {
    p.push("M1: the categorize poster creates a document — Categorize is a journal entry (CHAIN-05 §10.2); Match links an existing record");
  }
  const poster = fnBody(src.poster, "postBankCategorizationOnClient");
  if (!/postSourceTransactionInClientTx\(\s*client\b[\s\S]{0,200}source_transaction_type: "bank_categorization"/.test(poster)) {
    p.push("M2: postBankCategorizationOnClient does not post 'bank_categorization' through postSourceTransactionInClientTx on the caller's client");
  }
  const lines = fnBody(src.engine, "buildBankCategorizationLines");
  const catLine = lines.match(/const catLine[^=]*=\s*\{[\s\S]*?debit_or_credit:\s*moneyIn \? "credit" : "debit"/);
  const bankLine = lines.match(/const bankLine[^=]*=\s*\{[\s\S]*?debit_or_credit:\s*moneyIn \? "debit" : "credit"/);
  if (!catLine || !bankLine || !/const moneyIn = txn\.is_credit === true;/.test(lines)) {
    p.push("M3: buildBankCategorizationLines no longer puts the category Dr on money out / Cr on money in with the bank opposite, by is_credit");
  }
  for (const r of REFUSALS) {
    if (!new RegExp(`reason: "${r}"`).test(src.poster)) p.push(`M4: refusal '${r}' is gone from the categorize decision`);
  }
  return p;
}

/** L1–L4 for one live entry (exported for the selftest). */
export function entryProblems(e) {
  const p = [];
  const amt = Number(e.amount);
  if (e.money_in) {
    if (Number(e.dr_bank) !== amt || Number(e.cr_cat) !== amt) p.push(`L2: money-in entry ${e.je} is not Dr bank ${amt} / Cr chosen account ${amt} (Dr bank ${e.dr_bank}, Cr category ${e.cr_cat})`);
  } else if (Number(e.dr_cat) !== amt || Number(e.cr_bank) !== amt) {
    p.push(`L1: money-out entry ${e.je} is not Dr chosen account ${amt} / Cr bank ${amt} (Dr category ${e.dr_cat}, Cr bank ${e.cr_bank})`);
  }
  if (Number(e.n_lines) !== 2 || Number(e.net) !== 0) p.push(`L3: entry ${e.je} has ${e.n_lines} lines, net ${e.net}`);
  if (e.on_control) p.push(`L4: entry ${e.je} posts to an A/R or A/P control account`);
  return p;
}

const LIVE_SQL = () => `
  WITH je AS (
    SELECT DISTINCT je.id, je.operating_company_id, p.source_transaction_id
      FROM accounting.journal_entries je
      JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.source_transaction_type = 'bank_categorization'
     WHERE je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL)
  SELECT je.id::text AS je, bt.is_credit AS money_in, abs(bt.amount_cents)::bigint AS amount,
         count(q.id) AS n_lines,
         sum(CASE WHEN q.debit_or_credit='debit' THEN q.amount_cents ELSE -q.amount_cents END) AS net,
         sum(CASE WHEN q.debit_or_credit='debit' AND q.account_id = bt.categorization_gl_account_id THEN q.amount_cents ELSE 0 END) AS dr_cat,
         sum(CASE WHEN q.debit_or_credit='credit' AND q.account_id = bt.categorization_gl_account_id THEN q.amount_cents ELSE 0 END) AS cr_cat,
         sum(CASE WHEN q.debit_or_credit='debit' AND q.account_id = ba.ledger_account_id THEN q.amount_cents ELSE 0 END) AS dr_bank,
         sum(CASE WHEN q.debit_or_credit='credit' AND q.account_id = ba.ledger_account_id THEN q.amount_cents ELSE 0 END) AS cr_bank,
         bool_or(EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                          WHERE r.account_id = q.account_id AND r.is_active AND r.role IN ('ar_control','ap_control'))) AS on_control
    FROM je
    JOIN banking.bank_transactions bt ON bt.id::text = je.source_transaction_id AND bt.operating_company_id = je.operating_company_id
    LEFT JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id AND ba.operating_company_id = bt.operating_company_id
    JOIN accounting.journal_entry_postings q ON q.journal_entry_uuid = je.id
   WHERE ${NOT_FROZEN_SQL("je.operating_company_id")}
   GROUP BY je.id, bt.is_credit, bt.amount_cents`;

const src = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = staticProblems(src);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  const plant = (key, from, to) => ({ ...src, [key]: src[key].replace(from, to) });
  const goodOut = { je: "j", money_in: false, amount: 1000, n_lines: 2, net: 0, dr_cat: 1000, cr_cat: 0, dr_bank: 0, cr_bank: 1000, on_control: false };
  const goodIn = { je: "j", money_in: true, amount: 1000, n_lines: 2, net: 0, dr_cat: 0, cr_cat: 1000, dr_bank: 1000, cr_bank: 0, on_control: false };
  const cases = [
    ["M1", staticProblems({ ...src, poster: src.poster + "\nawait createAndPostBankLineExpenseOnClient(client, x, y);" })],
    ["M2", staticProblems(plant("poster", 'source_transaction_type: "bank_categorization"', 'source_transaction_type: "expense"'))],
    ["M3", staticProblems(plant("engine", 'debit_or_credit: moneyIn ? "credit" : "debit"', 'debit_or_credit: moneyIn ? "debit" : "credit"'))],
    ["M4", staticProblems(plant("poster", 'reason: "already_matched_to_bill"', 'reason: "skipped"'))],
    ["L1", entryProblems({ ...goodOut, dr_cat: 0, cr_cat: 1000, dr_bank: 1000, cr_bank: 0 })],
    ["L2", entryProblems({ ...goodIn, dr_bank: 0, cr_bank: 1000, dr_cat: 1000, cr_cat: 0 })],
    ["L3", entryProblems({ ...goodOut, n_lines: 3 })],
    ["L4", entryProblems({ ...goodOut, on_control: true })],
  ];
  const clean = [...entryProblems(goodOut), ...entryProblems(goodIn)];
  const missed = cases.filter(([rule, probs]) => !probs.some((x) => x.startsWith(rule))).map(([r]) => r);
  if (missed.length || clean.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join(", ")}${clean.length ? `; clean rows flagged: ${clean.join("; ")}` : ""}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${cases.length}/${cases.length} rules proven able to fail (M1–M4, L1–L4)`);
  process.exit(0);
}

const problems = staticProblems(src);
const url = process.env.DATABASE_URL;
let checked = null;
if (url) {
  const pgMod = await import("pg");
  const pg = pgMod.default ?? pgMod;
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const r = await c.query(LIVE_SQL());
    await c.query("ROLLBACK");
    checked = r.rows.length;
    for (const e of r.rows) problems.push(...entryProblems(e));
  } finally {
    await c.end();
  }
}
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — categorize posts one CHAIN-05 entry and creates no document${checked === null ? " (static only — no DATABASE_URL)" : `; live: ${checked} entr${checked === 1 ? "y" : "ies"} match their matrix row`}`);
