#!/usr/bin/env node
/**
 * GUARD (ROUND 441.5 Phase 2): a money-IN bank line categorized to any account is a DEPOSIT document (QBO "Add funds to
 * this deposit"), linked to the line both ways — never a bare journal entry. Owner, 2026-10-07: "ours should work exactly
 * as quickbooks."
 *
 * Measured 2026-10-07: 23 USMCA money-in categorizations ($35,355.00: 20 to 2410 related-party loan, 3 to 3000 owner's
 * capital) were bare bank_categorization journal entries.
 *
 * STATIC (always runs):
 *   S1 postBankCategorizationOnClient sends every money_in decision to postBankLineAsDepositOnClient before any bare
 *      bank_categorization posting
 *   S2 the deposit path creates the document with sourceBankTransactionId and stamps matched_deposit_id +
 *      matched_journal_entry_id on the line
 *   S3 the writer posts through postSourceTransactionInClientTx 'bank_deposit' with an 'account' line and records the operator
 *   S4 the deposit poster credits each 'account' line's own account (never everything to Undeposited Funds)
 *   S5 Undo of the line voids the deposit it created (voidBankDepositOnClient)
 * LIVE (with DATABASE_URL), USMCA:
 *   L1 no live bank_categorization JE on a money-in line
 *   L2 every live deposit with source_bank_transaction_id is named back by that line (matched_deposit_id) and the line's
 *      matched_journal_entry_id is the deposit's own entry
 *   L3 that entry balances
 *   L4 it debits the bank account's ledger account for the line's amount
 *   L5 it credits the line's chosen category for the line's amount
 *   L6 the deposit records the operator (created_by_user_id)
 *
 * Run: node scripts/verify-bank-categorized-money-in-is-deposit-document.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-categorized-money-in-is-deposit-document";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// verify-no-silent-db-skip (03d): the static rules always run and fail closed; the live rules run whenever DATABASE_URL
// is set, and the OK line says "static only" when they did not.
export const ALLOW_OFFLINE_SKIP = "static S1–S5 always run and fail closed; live L1–L6 run whenever DATABASE_URL is set";

export const FILES = {
  poster: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
  deposits: "apps/backend/src/accounting/bank-deposits.service.ts",
  engine: "apps/backend/src/accounting/posting-engine.service.ts",
  undo: "apps/backend/src/banking/bank-line-state-machine.service.ts",
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
  // ROUND 441.16 — money out is the Expense path; everything else (money in) is the Deposit, and no bare entry remains.
  if (!/return postBankLineAsDepositOnClient\(client, input, decision\);\s*\}\s*$/m.test(poster) ||
      /source_transaction_type: "bank_categorization"/.test(poster)) {
    p.push("S1: postBankCategorizationOnClient does not send money-in categorizations to the Deposit (or still writes a bare bank_categorization entry)");
  }
  const dep = fnBody(src.poster, "postBankLineAsDepositOnClient");
  if (!/createAndPostBankLineDepositOnClient\(/.test(dep) || !/sourceBankTransactionId: input\.bankTransactionId/.test(dep) ||
      !/SET matched_deposit_id = \$1::uuid,\s*matched_journal_entry_id = \$2::uuid/.test(dep)) {
    p.push("S2: the deposit path must create the document with sourceBankTransactionId and stamp matched_deposit_id + matched_journal_entry_id");
  }
  const writer = fnBody(src.deposits, "createAndPostBankLineDepositOnClient");
  if (!/postSourceTransactionInClientTx\(/.test(writer) || !/source_transaction_type: "bank_deposit"/.test(writer) ||
      !/'account'/.test(writer) || !/created_by_user_id/.test(writer) || /INSERT INTO accounting\.journal_entr/.test(writer)) {
    p.push("S3: the writer must post through postSourceTransactionInClientTx 'bank_deposit' with an 'account' line and record created_by_user_id");
  }
  const builder = fnBody(src.engine, "buildBankDepositLines");
  if (!/line_type = 'account'/.test(builder) || !/account_id: l\.account_id,\s*debit_or_credit: "credit"/.test(builder)) {
    p.push("S4: the deposit poster must credit each 'account' line's own account");
  }
  const undo = fnBody(src.undo, "voidDocumentsCreatedByLine");
  if (!/FROM accounting\.deposits\s+WHERE operating_company_id = \$1::uuid AND source_bank_transaction_id = \$2::uuid/.test(undo) ||
      !/voidBankDepositOnClient\(/.test(undo)) {
    p.push("S5: Undo of the line must void the deposit it created (voidBankDepositOnClient)");
  }
  return p;
}

/** L2–L6 for one deposit row (exported for the selftest). */
export function linkageProblems(d) {
  const p = [];
  if (d.bt_deposit !== d.deposit_id || d.bt_je !== d.je) p.push(`L2: deposit ${d.deposit_id} and bank line ${d.bt} do not name each other (line → ${d.bt_deposit}/${d.bt_je})`);
  if (Number(d.net) !== 0) p.push(`L3: deposit ${d.deposit_id} entry does not balance (net ${d.net})`);
  if (Number(d.dr_bank) !== Number(d.amount)) p.push(`L4: deposit ${d.deposit_id} entry does not debit the bank account for ${d.amount} (debited ${d.dr_bank})`);
  if (Number(d.cr_cat) !== Number(d.amount)) p.push(`L5: deposit ${d.deposit_id} entry does not credit the chosen category for ${d.amount} (credited ${d.cr_cat})`);
  if (!d.operator) p.push(`L6: deposit ${d.deposit_id} records no operator`);
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
      `SELECT DISTINCT je.id::text AS je
         FROM accounting.journal_entries je
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.source_transaction_type = 'bank_categorization'
         JOIN banking.bank_transactions bt ON bt.id::text = p.source_transaction_id AND bt.operating_company_id = je.operating_company_id
        WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.voided_at IS NULL
          AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND bt.is_credit = true`,
      [USMCA]
    );
    for (const r of l1.rows) p.push(`L1: bare money-in categorization entry ${r.je} with no deposit document`);
    const col = await c.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'accounting' AND table_name = 'deposits' AND column_name = 'source_bank_transaction_id'`
    );
    if (col.rows.length === 0) {
      await c.query("ROLLBACK");
      p.push("L2–L6: accounting.deposits.source_bank_transaction_id does not exist here — migration 202615440510 is not applied");
      return p;
    }
    const docs = await c.query(
      `SELECT d.id::text AS deposit_id, d.journal_entry_id::text AS je, d.created_by_user_id::text AS operator,
              bt.id::text AS bt, bt.matched_deposit_id::text AS bt_deposit, bt.matched_journal_entry_id::text AS bt_je,
              abs(bt.amount_cents)::bigint AS amount,
              (SELECT COALESCE(sum(CASE WHEN q.debit_or_credit='debit' THEN q.amount_cents ELSE -q.amount_cents END),0)
                 FROM accounting.journal_entry_postings q WHERE q.journal_entry_uuid = d.journal_entry_id)::bigint AS net,
              (SELECT COALESCE(sum(q.amount_cents),0) FROM accounting.journal_entry_postings q
                WHERE q.journal_entry_uuid = d.journal_entry_id AND q.debit_or_credit='debit' AND q.account_id = ba.ledger_account_id)::bigint AS dr_bank,
              (SELECT COALESCE(sum(q.amount_cents),0) FROM accounting.journal_entry_postings q
                WHERE q.journal_entry_uuid = d.journal_entry_id AND q.debit_or_credit='credit' AND q.account_id = bt.categorization_gl_account_id)::bigint AS cr_cat
         FROM accounting.deposits d
         JOIN banking.bank_transactions bt ON bt.id = d.source_bank_transaction_id
         LEFT JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id AND ba.operating_company_id = bt.operating_company_id
        WHERE d.operating_company_id = $1::uuid AND d.voided_at IS NULL AND d.source_bank_transaction_id IS NOT NULL`,
      [USMCA]
    );
    await c.query("ROLLBACK");
    for (const d of docs.rows) p.push(...linkageProblems(d));
  } finally {
    await c.end();
  }
  return p;
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = staticProblems(src);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  const plant = (key, from, to) => ({ ...src, [key]: src[key].replace(from, to) });
  const good = { deposit_id: "d", je: "j", operator: "u", bt: "b", bt_deposit: "d", bt_je: "j", amount: 1000, net: 0, dr_bank: 1000, cr_cat: 1000 };
  const cases = [
    ["S1", staticProblems(plant("poster", "  return postBankLineAsDepositOnClient(client, input, decision);\n}", "  return postBankLineAsExpenseOnClient(client, input, decision);\n}"))],
    ["S2", staticProblems(plant("poster", "SET matched_deposit_id = $1::uuid,", "SET reviewed_note = $1::text,"))],
    ["S3", staticProblems(plant("deposits", 'source_transaction_type: "bank_deposit", source_transaction_id: deposit.id },\n    { userId: actor.userId }', 'source_transaction_type: "journal_entry", source_transaction_id: deposit.id },\n    { userId: actor.userId }'))],
    ["S4", staticProblems(plant("engine", "WHERE deposit_id = $1::uuid AND operating_company_id = $2::uuid AND line_type = 'account'", "WHERE deposit_id = $1::uuid AND operating_company_id = $2::uuid AND false"))],
    ["S5", staticProblems(plant("undo", "await voidBankDepositOnClient(", "await Promise.resolve("))],
    ["L2", linkageProblems({ ...good, bt_deposit: null })],
    ["L3", linkageProblems({ ...good, net: 7 })],
    ["L4", linkageProblems({ ...good, dr_bank: 0 })],
    ["L5", linkageProblems({ ...good, cr_cat: 1 })],
    ["L6", linkageProblems({ ...good, operator: null })],
  ];
  const clean = linkageProblems(good);
  const missed = cases.filter(([rule, probs]) => !probs.some((x) => x.startsWith(rule))).map(([r]) => r);
  if (missed.length || clean.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join(", ")}${clean.length ? `; clean row flagged: ${clean.join("; ")}` : ""}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${cases.length}/${cases.length} rules proven able to fail (S1–S5, L2–L6)`);
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
console.log(`${LABEL}: OK — money-in categorizations are deposit documents linked both ways${url ? "; live L1–L6 clean" : " (static only — no DATABASE_URL)"}`);
