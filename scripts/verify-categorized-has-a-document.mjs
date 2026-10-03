#!/usr/bin/env node
// ROUND 360 (CC-2) — a Categorized bank line names HOW it got there and points at a LIVE document.
//   categorized => resolution_kind NOT NULL AND a live link (the document exists and is not voided / revoked / reversed).
// A line claiming a document it does not have is the lie that stranded 29 USMCA lines. Spec:
// docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
// Static: the migration's CHECKs (kind present iff categorized; categorized iff a link). Live, UNSCOPED, ceiling 0:
// categorized lines with no kind, no link, or a link to a dead expense / bill / bill payment / customer payment /
// transfer / fuel fill / Relay fill / journal entry. Positive control: the live links counted the same way must be > 0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUCKET_SQL, LINKED_SQL, NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "every categorized bank line, unscoped, points at a live document";

const LABEL = "verify-categorized-has-a-document";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615350600_bank_feed_bucket_and_kind.sql";

/** [kind, link column, "the document is live" predicate over alias d]. */
export const DOCS = [
  ["expense", "matched_expense_id", "accounting.expenses d WHERE d.id = bt.matched_expense_id AND d.voided_at IS NULL"],
  ["bill", "matched_bill_id", "accounting.bills d WHERE d.id = bt.matched_bill_id AND d.voided_at IS NULL AND d.revoked_at IS NULL"],
  ["bill_payment", "matched_bill_payment_id", "accounting.bill_payments d WHERE d.id = bt.matched_bill_payment_id AND d.voided_at IS NULL AND d.revoked_at IS NULL"],
  ["customer_payment", "matched_payment_id", "accounting.payments d WHERE d.id = bt.matched_payment_id AND d.voided_at IS NULL"],
  ["transfer", "matched_transfer_id", "banking.transfers d WHERE d.id = bt.matched_transfer_id AND d.revoked_at IS NULL"],
  ["fuel fill", "matched_fuel_transaction_id", "fuel.fuel_transactions d WHERE d.id = bt.matched_fuel_transaction_id AND d.voided_at IS NULL"],
  ["relay fill", "matched_relay_fuel_transaction_id", "integrations.relay_fuel_transactions d WHERE d.id = bt.matched_relay_fuel_transaction_id AND d.voided_at IS NULL"],
  ["journal_entry", "matched_journal_entry_id", "accounting.journal_entries d WHERE d.id = bt.matched_journal_entry_id AND d.status = 'posted' AND d.reversed_by_je_id IS NULL AND d.voided_at IS NULL"],
];

export function check(mig) {
  const f = [];
  if (!/chk_bank_line_resolution_kind[\s\S]{0,300}review_bucket = 'categorized' AND resolution_kind IN \('added', 'matched', 'transfer', 'split'\)/.test(mig)) f.push(`${MIG}: CHECK categorized => resolution_kind in (added, matched, transfer, split) is gone`);
  if (!/chk_bank_line_bucket_matches_link[\s\S]{0,200}\(review_bucket = 'categorized'\) = \(/.test(mig)) f.push(`${MIG}: CHECK categorized <=> a document link is gone`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["kind CHECK dropped", real.replace(/review_bucket = 'categorized' AND resolution_kind IN \('added', 'matched', 'transfer', 'split'\)/, "review_bucket = 'categorized'")],
    ["link CHECK dropped", real.replace("(review_bucket = 'categorized') = (", "(review_bucket = 'categorized') OR (")],
  ];
  for (const [n, s] of plants) if (s === real) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const statik = check(fs.readFileSync(path.join(ROOT, MIG), "utf8"));
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c, { hasBucket }) => {
  const cat = `${BUCKET_SQL(hasBucket)} = 'categorized' AND bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()}`;
  const noKind = hasBucket ? Number((await c.query(`SELECT count(*) AS n FROM banking.bank_transactions bt WHERE ${cat} AND bt.resolution_kind IS NULL`)).rows[0].n) : 0;
  const noLink = Number((await c.query(`SELECT count(*) AS n FROM banking.bank_transactions bt WHERE ${cat} AND NOT ${LINKED_SQL()}`)).rows[0].n);
  const dead = [];
  let live = 0;
  for (const [kind, col, liveSql] of DOCS) {
    const row = (await c.query(`
      SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ${liveSql}))::int AS dead,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${liveSql}))::int AS live,
             (array_agg(bt.id::text) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ${liveSql})))[1:3] AS ids
        FROM banking.bank_transactions bt WHERE ${cat} AND bt.${col} IS NOT NULL`)).rows[0];
    live += row.live;
    if (row.dead) dead.push(`${row.dead} categorized line(s) linked to a dead ${kind} (e.g. ${row.ids.join(", ")})`);
  }
  return { noKind, noLink, dead, live };
});
const fails = [...r.dead];
if (r.noKind) fails.push(`${r.noKind} categorized line(s) with no resolution_kind`);
if (r.noLink) fails.push(`${r.noLink} categorized line(s) with no document link`);
if (r.live === 0) fails.push("positive control: 0 live document links read — the instrument saw nothing; that is not a pass");
report(LABEL, fails, `${r.total} bank lines (every non-frozen company, bypass=${r.bypass}${r.hasBucket ? "" : ", classifier preview"}); ${r.live} live document links on categorized lines; 0 without a kind, 0 without a link, 0 to a dead document`);
