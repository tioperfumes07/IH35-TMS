#!/usr/bin/env node
// ROUND 360 (CC-2) — after UNMATCH the document is back in the match pool, at once. The likeliest way that breaks is the
// document's OWN flags: a released document still flagged on its own row never comes back. Spec:
// docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md, hard requirement 2.
// The flags a document carries, and what the Match drawer (match.service.ts fetchLedgerCandidates) excludes on:
//   banking.reconciliation_matches  live auto_matched / user_matched row -> hidden from every line
//   bill_payments.source_bank_transaction_id                             -> hidden
//   payments / bill_payments.cleared_date                                -> reads CLEARED on every balance
// Live, UNSCOPED, ceiling 0:
//   (a) a live match row whose bank line is voided or carries no document at all (released, yet the row still holds the
//       document). A multi-document match stamps only the first entry's column, so a line holding ANY link backs its rows.
//   (b) a bill payment whose source_bank_transaction_id names a line that neither links it nor created it
//   (c) a payment / bill payment CLEARED with no live bank line linking it and none that created it
// Static: unmatch retires EVERY live match row of the line (any kind), voided; re-match revives the row; unmatch clears
// source_bank_transaction_id + cleared_date; the drawer's exclusion reads only live auto/user matches.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LINKED_SQL, NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "no released document is still flagged as matched on its own row, unscoped";

const LABEL = "verify-unmatched-document-is-matchable-again";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNMATCH = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";
// The release function must retire every live auto/user row of the line, not only the pointer-backed ones.
const RELEASE_MIGRATION = "db/migrations/202615330930_send_back_keeps_the_match.sql";
const RELEASE_MARKER = /SET released_from_state = rm\.match_state,[\s\S]{0,300}AND rm\.match_state IN \('auto_matched', 'user_matched'\)/.test(fs.readFileSync(path.join(ROOT, RELEASE_MIGRATION), "utf8")) ? "RELEASE_SQL_RETIRES_ALL_LIVE_ROWS" : "";
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";

export function check({ unmatch, match }) {
  const f = [];
  const fn = unmatch.slice(unmatch.indexOf("export async function unmatchBankTransactionOnClient"));
  // ROUND 363-CC3-B / LAW 363.9: unmatch takes every live row out of the live set by RELEASING it (match_state
  // 'released' — the drawer and every live-set reader count only auto/user matches), not by flipping it to 'rejected'
  // in place. The release runs through banking.release_bank_line_matches(), which releases every pointer AND every live
  // auto/user row of the line whatever its kind (migration 202615330930; pinned by verify-send-back-preserves-the-match).
  if (!/await releaseBankLineMatches\(client,/.test(fn) || !/RELEASE_SQL_RETIRES_ALL_LIVE_ROWS/.test(RELEASE_MARKER))
    f.push(`${UNMATCH}: unmatch must take EVERY live match row of the line out of the live set (release it), whatever its kind`);
  if (/ledger_entry_kind = \$3/.test(fn.slice(0, fn.indexOf("return {")))) f.push(`${UNMATCH}: unmatch retires match rows per kind again — kinds left out stay hidden from the drawer`);
  for (const t of ["accounting.payments", "accounting.bill_payments"]) {
    if (!new RegExp(`UPDATE ${t.replace(".", "\\.")}\\s+SET source_bank_transaction_id = NULL,[\\s\\S]{0,120}cleared_date = NULL`).test(fn)) f.push(`${UNMATCH}: unmatch must clear ${t} source_bank_transaction_id AND cleared_date`);
  }
  // A released row sits outside the partial unique index, so a re-match inserts a NEW live row; a row voided by an older
  // path is still revived. Both make the pair live again.
  if (!/ON CONFLICT \(bank_transaction_id, ledger_entry_kind, ledger_entry_id\)(?:\s+WHERE match_state <> 'released')?\s+DO UPDATE SET[\s\S]{0,300}voided_at = NULL/.test(match)) f.push(`${MATCH}: storeMatch must revive a retired row on re-match (voided_at = NULL)`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = { unmatch: fs.readFileSync(path.join(ROOT, UNMATCH), "utf8"), match: fs.readFileSync(path.join(ROOT, MATCH), "utf8") };
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["match rows no longer released", { ...real, unmatch: real.unmatch.replace("await releaseBankLineMatches(client,", "await skipRelease(client,") }],
    ["cleared_date left set", { ...real, unmatch: real.unmatch.replace(/(UPDATE accounting\.payments\s+SET source_bank_transaction_id = NULL,\s+)cleared_date = NULL/, "$1cleared_date = cleared_date") }],
    ["re-match leaves the row voided", { ...real, match: real.match.replace(/(DO UPDATE SET[\s\S]{0,300})voided_at = NULL/, "$1voided_at = voided_at") }],
  ];
  for (const [n, s] of plants) if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const statik = check({ unmatch: fs.readFileSync(path.join(ROOT, UNMATCH), "utf8"), match: fs.readFileSync(path.join(ROOT, MATCH), "utf8") });
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c, { hasBucket }) => {
  const stale = (await c.query(`
    SELECT m.ledger_entry_kind AS kind, count(*)::int AS n, (array_agg(m.ledger_entry_id::text))[1:3] AS ids
      FROM banking.reconciliation_matches m
      JOIN banking.bank_transactions bt ON bt.id = m.bank_transaction_id
     WHERE m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched') AND ${NOT_FROZEN_SQL("m.operating_company_id")}
       AND (bt.voided_at IS NOT NULL OR NOT ${LINKED_SQL()})
     GROUP BY 1`)).rows;
  const liveRows = (await c.query(`SELECT count(*)::int AS n FROM banking.reconciliation_matches m WHERE m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched') AND ${NOT_FROZEN_SQL("m.operating_company_id")}`)).rows[0].n;
  const strayBp = (await c.query(`
    SELECT count(*)::int AS n, (array_agg(bp.id::text))[1:3] AS ids
      FROM accounting.bill_payments bp JOIN banking.bank_transactions bt ON bt.id = bp.source_bank_transaction_id
     WHERE bp.voided_at IS NULL AND bp.revoked_at IS NULL AND ${NOT_FROZEN_SQL("bp.operating_company_id")}
       AND bt.matched_bill_payment_id IS DISTINCT FROM bp.id
       AND bt.linked_entity_id IS DISTINCT FROM bp.bill_id
       AND bt.status IS DISTINCT FROM 'split'
       AND COALESCE(bp.payment_source_kind, '') <> 'bank_tx_bulk_post'`)).rows[0];
  const clearedNoLine = [];
  for (const [t, col] of [["accounting.payments", "matched_payment_id"], ["accounting.bill_payments", "matched_bill_payment_id"]]) {
    const row = (await c.query(`
      SELECT count(*)::int AS n, (array_agg(d.id::text))[1:3] AS ids FROM ${t} d
       WHERE d.voided_at IS NULL AND d.cleared_date IS NOT NULL AND ${NOT_FROZEN_SQL("d.operating_company_id")}
         AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt WHERE bt.voided_at IS NULL AND (bt.${col} = d.id OR bt.id = d.source_bank_transaction_id))`)).rows[0];
    if (row.n) clearedNoLine.push(`${row.n} ${t} CLEARED with no bank line linking or creating it (e.g. ${row.ids.join(", ")})`);
  }
  return { stale, liveRows, strayBp, clearedNoLine, hasBucket };
});
// Before 202615350600 is applied the stale rows are exactly the population that migration retires: reported, not failed.
const preApply = !r.hasBucket ? r.stale : [];
const fails = [
  ...(r.hasBucket ? r.stale : []).map((x) => `${x.n} live ${x.kind} match row(s) on a bank line that is voided or carries no document — the document stays hidden from the Match drawer (e.g. ${x.ids.join(", ")})`),
  ...(r.strayBp.n ? [`${r.strayBp.n} bill payment(s) whose source_bank_transaction_id names a line that neither links nor created it — hidden from the drawer (e.g. ${r.strayBp.ids.join(", ")})`] : []),
  ...r.clearedNoLine,
];
if (preApply.length) console.log(`${LABEL}: 202615350600 not yet applied — it retires ${preApply.reduce((a, x) => a + x.n, 0)} stale match row(s) (${preApply.map((x) => `${x.kind} ${x.n}`).join(", ")}); ceiling 0 after it applies`);
report(LABEL, fails, `${r.liveRows} live match rows (every non-frozen company, bypass=${r.bypass}), every one backed by its line's link${preApply.length ? " except the stale rows the migration retires" : ""}; 0 bill payments held by a stale line; 0 documents CLEARED without a bank line`);
