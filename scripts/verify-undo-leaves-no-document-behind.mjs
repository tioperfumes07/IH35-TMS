#!/usr/bin/env node
// ROUND 360 (CC-2) — UNDO of a categorize removes what it created: no document survives whose bank line is back in For
// review / Excluded. Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
// (Measured before ROUND 360: UNDO left the categorization's posting live in the account it was uncategorized from.)
// Live, UNSCOPED, ceiling 0 — for every For-review / Excluded line, none of these may be live:
//   a bill / bill payment / customer payment it created (source_bank_transaction_id = the line)
//   an unreversed bank_categorization journal entry for the line
//   an unrevoked transfer the line minted (minted_from_bank_transaction_id = the line)
// Static: the state machine removes all four on undo of kind added / split / minted transfer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUCKET_SQL, NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "no document outlives the undo of the bank line that created it, unscoped";

const LABEL = "verify-undo-leaves-no-document-behind";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/banking/bank-line-state-machine.service.ts";

export function check(engine) {
  const f = [];
  for (const [t, re] of [
    ["bill payments", /FROM accounting\.bill_payments\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid/],
    ["customer payments", /FROM accounting\.payments\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid/],
    ["bills", /FROM accounting\.bills\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid/],
    // ROUND 441.5 — the Expense a categorized money-out line created.
    ["expenses", /FROM accounting\.expenses\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid AND voided_at IS NULL`/],
    // ROUND 441.5 Phase 2 — the Deposit a categorized money-in line created.
    ["deposits", /FROM accounting\.deposits\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid AND voided_at IS NULL`[\s\S]{0,400}voidBankDepositOnClient\(/],
  ]) if (!re.test(engine)) f.push(`${ENGINE}: undo no longer voids the ${t} the line created`);
  // ROUND 441.5 — the entry is reversed here unless the line created an Expense, whose own void (above) reverses it.
  if (!/if \(line\.matched_journal_entry_id(?: && createdExpense\.rows\.length === 0)?\) \{\s*const r = await reverseOnceOnClient/.test(engine)) f.push(`${ENGINE}: undo of a categorize no longer reverses the entry it posted`);
  if (!/minted_from_bank_transaction_id === line\.id/.test(engine)) f.push(`${ENGINE}: undo no longer revokes the transfer the line minted (and only that one)`);
  return f;
}

export function judge(rows) {
  return rows.filter((r) => r.n > 0).map((r) => `${r.n} live ${r.kind}(s) created by a bank line that is back in ${r.bucket} (e.g. ${r.ids.join(", ")})`);
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, ENGINE), "utf8");
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["bills no longer voided", real.replace(/FROM accounting\.bills\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id/, "FROM accounting.bills WHERE false AND source_bank_transaction_id")],
    ["deposit no longer voided", real.replace("await voidBankDepositOnClient(", "await Promise.resolve(")],
    ["expense no longer voided", real.replace("SELECT 'expense', id::text FROM accounting.expenses", "SELECT 'expense', id::text FROM accounting.bills")],
    ["JE no longer reversed", real.replace("if (line.matched_journal_entry_id && createdExpense.rows.length === 0) {\n      const r = await reverseOnceOnClient", "if (false) {\n      const r = await reverseOnceOnClient")],
    ["any transfer revoked", real.replace("minted_from_bank_transaction_id === line.id", "minted_from_bank_transaction_id !== undefined")],
  ];
  for (const [n, s] of plants) if (s === real) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (judge([{ kind: "bill", bucket: "for_review", n: 1, ids: ["x"] }]).length !== 1) fails.push("judge missed a left-behind bill");
  if (judge([{ kind: "bill", bucket: "for_review", n: 0, ids: [] }]).length !== 0) fails.push("judge flagged zero");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 3}/${plants.length + 3}`);
  process.exit(0);
}

const statik = check(fs.readFileSync(path.join(ROOT, ENGINE), "utf8"));
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c, { hasBucket }) => {
  const open = `bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()} AND ${BUCKET_SQL(hasBucket)} IN ('for_review', 'excluded')`;
  const one = async (kind, sql) => {
    const row = (await c.query(`SELECT count(*)::int AS n, (array_agg(x.id))[1:3] AS ids, min(x.bucket) AS bucket FROM (${sql}) x`)).rows[0];
    return { kind, n: row.n, ids: row.ids ?? [], bucket: row.bucket };
  };
  const rows = [
    await one("bill", `SELECT d.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM accounting.bills d JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id WHERE d.voided_at IS NULL AND d.revoked_at IS NULL AND ${open}`),
    await one("bill payment", `SELECT d.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM accounting.bill_payments d JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id WHERE d.voided_at IS NULL AND d.revoked_at IS NULL AND ${open}`),
    await one("customer payment", `SELECT d.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM accounting.payments d JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id WHERE d.voided_at IS NULL AND ${open}`),
    // a categorization entry still standing: posted, never reversed, and not itself a reversal (reverses_je_id)
    await one("categorization journal entry", `SELECT DISTINCT je.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid JOIN banking.bank_transactions bt ON bt.id::text = p.source_transaction_id::text WHERE p.source_transaction_type = 'bank_categorization' AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND ${open}`),
  ];
  // ROUND 441.5 — an Expense created by categorizing the line (column exists once migration 202615440500 is applied).
  const hasExpenseLink = (
    await c.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'source_bank_transaction_id'`
    )
  ).rows.length > 0;
  const hasDepositLink = (
    await c.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'accounting' AND table_name = 'deposits' AND column_name = 'source_bank_transaction_id'`
    )
  ).rows.length > 0;
  if (hasDepositLink) rows.push(await one("deposit", `SELECT d.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM accounting.deposits d JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id WHERE d.voided_at IS NULL AND ${open}`));
  if (hasExpenseLink) rows.push(await one("expense", `SELECT d.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM accounting.expenses d JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id WHERE d.voided_at IS NULL AND ${open}`));
  if (hasBucket) rows.push(await one("minted transfer", `SELECT t.id::text AS id, ${BUCKET_SQL(hasBucket)} AS bucket FROM banking.transfers t JOIN banking.bank_transactions bt ON bt.id = t.minted_from_bank_transaction_id WHERE t.revoked_at IS NULL AND ${open}`));
  const seen = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_transactions bt WHERE ${open}`)).rows[0].n;
  return { rows, seen };
});
const fails = judge(r.rows);
if (r.seen === 0) fails.push("positive control: 0 For-review / Excluded lines read — the instrument saw nothing");
report(LABEL, fails, `${r.seen} For-review / Excluded lines (every non-frozen company, bypass=${r.bypass}); 0 documents outlive their bank line's undo (${r.rows.map((x) => x.kind).join(", ")})`);
