// LEAD 443.258.5 ruling 2 / 443.258.6 (CC-2, writer shape B) — the Dreamline statement card differences become DOCUMENTS.
// OWNER, verbatim 10-22 8:25 PM CT: "REMEMBER FIND THE ROOTCAUSES AND CREATE PERMANENT SOLUTION AND FIX. ALWAYS FIX ENGINES,
// NEVER DEFER." and 9:55 PM CT: "fix".
// Every LIVE "Dreamline statement <marker> — Fuel Card Discount" journal entry (hand-written by the old
// postStatementDifference, tagged fuel_card_discount, not yet reversed) is:
//   1. voided through THE void engine (reverseJournalEntryNoFlip: an equal and opposite reversal JE, audit row), and
//   2. re-issued as its document through THE expense writer — positive (card charged less) = a card-CREDIT expense
//      (is_credit, Dr 2510 / Cr Fuel Card Discount, QBO Credit Card Credit, number <marker>-CARD-DISC); negative (card
//      charged more) = an ordinary expense (Dr Fuel Card Discount / Cr 2510, number <marker>-CARD-DIFF) — both carrying
//      the receipt's vendor and load (the load decides unit / driver / trailer).
// 443.258.6: in BATCHES (default 25) — each batch ONE transaction that refuses (ROLLBACK and stop) unless, inside it,
// the net change on 5000 and on 2510 is exactly $0.00 and the trial balance is 0. A rerun skips done documents (a
// reversed statement JE is no longer selected; the writer refuses a second <marker>-CARD-DISC). USMCA only. No DELETE.
// Refuses outright when accounting.expenses.is_credit does not exist (the writer would then post money OUT).
//   default: dry run (first batch, ROLLBACK) · --fork-commit (assertNotProduction) · --apply with OWNER_AUTH_ID=AUTH-453
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { postStatementCardCreditAsExpense, postStatementCostDifferenceAsExpense } from "../../apps/backend/src/fuel/dreamline-statement-import.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "LEAD 443.258.5 ruling 2: the statement card difference is re-issued as its document (card credit / expense) through the expense writer — the hand-written statement JE is voided by the void engine";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const COMMIT = APPLY || FORK;
const BATCH = Math.max(1, Number(process.env.BATCH ?? 25));
if (APPLY) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  // verify-owner-authorization: LEAD 443.258.6 — owner 10-22 8:25 PM CT "ALWAYS FIX ENGINES, NEVER DEFER." / 9:55 PM CT "fix".
  if (auth !== "AUTH-453") throw new Error("--apply requires OWNER_AUTH_ID=AUTH-453");
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c as never, { label: "443.258.5 statement discounts to card credits" });
else if (FORK) await assertNotProduction(c as never, { label: "443.258.5 statement discounts to card credits (fork)" });
const col = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'is_credit'`);
if (!col.rowCount) throw new Error("REFUSED: accounting.expenses.is_credit is missing — apply 202616190700 first (the writer would post money OUT)");

const tb = async () =>
  (await c.query<{ net: string; n: string }>(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net, count(*)::text AS n
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0];
const acctNet = async (num: string) =>
  Number((await c.query<{ net: string }>(
    `SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS net
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.operating_company_id = $1::uuid AND je.voided_at IS NULL AND a.account_number = $2`, [USMCA, num])).rows[0].net);
const LIVE_SQL = `
    SELECT je.id::text AS je, je.entry_date::text, je.memo,
           min(p.source_transaction_id) AS receipt,
           sum(CASE WHEN a.account_number = '5000' THEN (CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END)::text AS cents_5000,
           max(CASE WHEN a.account_number = '5000' THEN p.account_id::text END) AS acct_5000,
           max(CASE WHEN a.account_number <> '5000' THEN p.account_id::text END) AS acct_2510
      FROM accounting.journal_entries je
      JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
      JOIN catalogs.accounts a ON a.id = p.account_id
     WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND je.status = 'posted'
       AND je.memo LIKE '% statement % — Fuel Card Discount'
       AND EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = p.id AND l.relationship_role = 'fuel_card_discount')
       AND je.reversed_by_je_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.reverses_je_id = je.id AND r.voided_at IS NULL)
     GROUP BY je.id, je.entry_date, je.memo
     ORDER BY je.entry_date, je.id`;

type Row = { marker: string; voided_je: string; reversal_je: string; new_je: string; doc: string; cents: number; receipt: string };
const all: Row[] = [];
const batches: Array<Record<string, unknown>> = [];
for (let b = 1; ; b++) {
  await c.query("BEGIN");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  await c.query("SET LOCAL lock_timeout = '5s'");
  await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
  await c.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER]);
  const tbBefore = await tb();
  if (tbBefore.net !== "0") { await c.query("ROLLBACK"); throw new Error(`REFUSED: batch ${b} TB ${tbBefore.net} before`); }
  const b5000 = await acctNet("5000"), b2510 = await acctNet("2510");
  const jes = (await c.query<{ je: string; entry_date: string; memo: string; receipt: string; cents_5000: string; acct_5000: string; acct_2510: string }>(
    `${LIVE_SQL} LIMIT ${BATCH}`, [USMCA])).rows;
  if (!jes.length) { await c.query("ROLLBACK"); break; }
  const item = (await c.query<{ id: string }>(
    `SELECT i.id::text FROM catalogs.items i WHERE i.item_name = 'Fuel Card Discount' AND i.deactivated_at IS NULL
       AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL) ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`,
    [USMCA])).rows[0]?.id;
  if (!item) { await c.query("ROLLBACK"); throw new Error("REFUSED: Fuel Card Discount item missing"); }
  const rows: Row[] = [];
  try {
    for (const j of jes) {
      const marker = /statement (\S+) —/.exec(j.memo)?.[1];
      if (!marker || !j.receipt || !j.acct_5000 || !j.acct_2510) throw new Error(`unreadable statement JE ${j.je} (${j.memo})`);
      const rev = await reverseJournalEntryNoFlip(c as never, { operatingCompanyId: USMCA, journalEntryId: j.je, reason: REASON, actorUserId: OWNER_USER });
      if (!rev.reversal.reversal_journal_entry_id) throw new Error(`${marker} — the void engine wrote no reversal for ${j.je}`);
      const cents = Number(j.cents_5000); // + = card charged less (credit 5000) · − = card charged more (debit 5000)
      const input = {
        companyId: USMCA, actor: OWNER_USER, expenseId: j.receipt, differenceCents: cents, date: j.entry_date.slice(0, 10), marker,
        payableId: j.acct_2510, discountAccountId: j.acct_5000, discountItemId: item,
      };
      const newJe = cents > 0 ? await postStatementCardCreditAsExpense(c as never, input) : await postStatementCostDifferenceAsExpense(c as never, input);
      if (!newJe) throw new Error(`${marker} — a document with this statement number already exists (nothing re-issued)`);
      rows.push({ marker, voided_je: j.je, reversal_je: String(rev.reversal.reversal_journal_entry_id), new_je: newJe, doc: cents > 0 ? `${marker}-CARD-DISC` : `${marker}-CARD-DIFF`, cents, receipt: j.receipt });
    }
  } catch (e) {
    await c.query("ROLLBACK");
    throw new Error(`REFUSED: batch ${b} rolled back — ${(e as Error).message}`);
  }
  const tbAfter = await tb();
  const d5000 = (await acctNet("5000")) - b5000, d2510 = (await acctNet("2510")) - b2510;
  const bad: string[] = [];
  if (d5000 !== 0) bad.push(`5000 moved ${d5000}`);
  if (d2510 !== 0) bad.push(`2510 moved ${d2510}`);
  if (tbAfter.net !== "0") bad.push(`TB ${tbAfter.net} after`);
  const info = { batch: b, documents: rows.length, cents: rows.reduce((a, r) => a + r.cents, 0), net_5000_change: d5000, net_2510_change: d2510, tb_after: tbAfter };
  if (bad.length) { await c.query("ROLLBACK"); console.log(JSON.stringify(info)); throw new Error(`REFUSED: batch ${b} rolled back — ${bad.join("; ")}`); }
  if (COMMIT) await c.query("COMMIT"); else await c.query("ROLLBACK");
  console.log(JSON.stringify({ ...info, result: COMMIT ? "COMMITTED" : "DRY RUN — ROLLED BACK" }));
  batches.push(info);
  all.push(...rows);
  if (!COMMIT) break; // a dry run proves the first batch only (nothing is committed, so the next batch would repeat it)
}
const left = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM (${LIVE_SQL}) x`, [USMCA])).rows[0].n);
const docs = (await c.query<{ n: string; cents: string }>(
  `SELECT count(*)::text AS n, COALESCE(sum(total_amount_cents), 0)::text AS cents FROM accounting.expenses
    WHERE operating_company_id = $1::uuid AND is_credit AND voided_at IS NULL AND vendor_document_number LIKE '%-CARD-DISC'`, [USMCA])).rows[0];
console.log(JSON.stringify({ batches: batches.length, documents_this_run: all.length, cents_this_run: all.reduce((a, r) => a + r.cents, 0),
  live_statement_discount_jes_left: left, card_credit_docs_total: Number(docs.n), card_credit_cents_total: Number(docs.cents), tb: await tb() }, null, 1));
if (process.env.LIST_OUT) fs.writeFileSync(process.env.LIST_OUT, JSON.stringify(all, null, 1));
await c.end();
