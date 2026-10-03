#!/usr/bin/env node
// ROUND 368.2(b) (CC-2) — a bank line may not sit matched to nothing, PERMANENTLY: the database refuses it.
// Spec: docs/bus/10-03-2026-ALL-SEATS-ROUND-368-PRIORITY-CHANGE-RECLASSIFY-FIRST-AND-THE-TWO-PERMANENT-REFUSALS.md
// Static: migration 202615360600 keeps the refusals — CONSTRAINT TRIGGERs DEFERRABLE INITIALLY DEFERRED on
//   banking.bank_transactions (dead link; released-but-still-holding a live match row), banking.reconciliation_matches
//   (live row on a released line) and all 13 document tables (a document going not-live / deleted under a live line).
// Live (DATABASE_URL — read the DIRECT endpoint), every non-frozen company, ceiling 0:
//   - 0 live lines whose matched_* names a missing / not-live document (banking.bank_line_dead_link once applied);
//   - 0 live match rows on a released or voided line;
//   - once 202615360600 is applied, every trigger is present in pg_trigger (a refusal that is not installed is not one).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LINKED_SQL, NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "no bank line is matched to nothing, every non-frozen company, on the direct endpoint";

const LABEL = "verify-no-bank-line-is-matched-to-nothing";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615360600_bank_line_matched_to_nothing_refusal.sql";
export const DOCUMENT_TABLES = [
  "accounting.bills", "accounting.bill_payments", "accounting.expenses", "accounting.payments", "accounting.invoices",
  "banking.transfers", "accounting.journal_entries", "mdata.loads", "driver_finance.driver_settlements",
  "driver_finance.driver_advances", "accounting.factoring_advances", "fuel.fuel_transactions", "integrations.relay_fuel_transactions",
];
const expectedTriggers = () => [
  ["banking.bank_transactions", "trg_bank_line_not_matched_to_nothing"],
  ["banking.reconciliation_matches", "trg_live_match_row_has_a_linked_line"],
  ...DOCUMENT_TABLES.flatMap((t) => {
    const n = t.split(".")[1];
    return [[t, `trg_${n}_not_dead_under_bank_line`], [t, `trg_${n}_delete_not_under_bank_line`]];
  }),
];

export function check(mig) {
  const f = [];
  for (const [table, trg] of expectedTriggers()) {
    const re = new RegExp(`CREATE CONSTRAINT TRIGGER ${trg}\\s+AFTER [A-Z ,_a-z]+ ON ${table.replace(".", "\\.")}\\s+DEFERRABLE INITIALLY DEFERRED`);
    if (!re.test(mig)) f.push(`${MIG}: ${trg} on ${table} must be a CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`);
  }
  if (!/still holds a live match row/.test(mig)) f.push(`${MIG}: the bank-line refusal no longer refuses a released line that keeps a live match row`);
  if (!/RETURNS text\s+LANGUAGE sql STABLE[\s\S]{0,6000}?FROM banking\.bank_transactions bt\s+WHERE bt\.id = p_line_id/.test(mig)) f.push(`${MIG}: banking.bank_line_dead_link must judge the line as stored`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["bank-line trigger made immediate", real.replace(/(CREATE CONSTRAINT TRIGGER trg_bank_line_not_matched_to_nothing\s+AFTER INSERT OR UPDATE ON banking\.bank_transactions\s+)DEFERRABLE INITIALLY DEFERRED/, "$1NOT DEFERRABLE")],
    ["document side dropped for expenses", real.replace("CREATE CONSTRAINT TRIGGER trg_expenses_not_dead_under_bank_line", "CREATE TRIGGER trg_expenses_not_dead_under_bank_line")],
    ["release-without-retire no longer refused", real.replace("still holds a live match row", "is fine")],
  ];
  for (const [n, s] of plants) if (s === real) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const statik = check(fs.readFileSync(path.join(ROOT, MIG), "utf8"));
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c) => {
  const applied = (await c.query(`SELECT to_regprocedure('banking.bank_line_dead_link(uuid)') IS NOT NULL AS a`)).rows[0].a;
  const lines = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_transactions bt WHERE bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()}`)).rows[0].n;
  let dead = [];
  if (applied) {
    dead = (await c.query(`
      SELECT x.col, count(*)::int AS n, (array_agg(x.id::text))[1:3] AS ids
        FROM (SELECT bt.id, banking.bank_line_dead_link(bt.id) AS col FROM banking.bank_transactions bt
               WHERE bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()}) x
       WHERE x.col IS NOT NULL GROUP BY 1`)).rows;
  }
  const staleRows = (await c.query(`
    SELECT count(*)::int AS n FROM banking.reconciliation_matches m JOIN banking.bank_transactions bt ON bt.id = m.bank_transaction_id
     WHERE m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched') AND ${NOT_FROZEN_SQL("m.operating_company_id")}
       AND (bt.voided_at IS NOT NULL OR NOT ${LINKED_SQL()})`)).rows[0].n;
  const present = applied
    ? (await c.query(`SELECT c.relnamespace::regnamespace::text || '.' || c.relname AS t, tg.tgname FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid WHERE tg.tgname LIKE 'trg_%' AND tg.tgconstraint <> 0`)).rows.map((x) => `${x.t}|${x.tgname}`)
    : [];
  return { applied, lines, dead, staleRows, present };
});
const fails = [
  ...r.dead.map((d) => `${d.n} live line(s) whose ${d.col} names a missing / not-live document (e.g. ${d.ids.join(", ")})`),
  ...(r.staleRows ? [`${r.staleRows} live match row(s) on a released or voided line`] : []),
];
if (r.applied) for (const [t, trg] of expectedTriggers()) if (!r.present.includes(`${t}|${trg}`)) fails.push(`${trg} on ${t} is not installed — a refusal that is not installed is not a refusal`);
report(LABEL, fails, `${r.lines} live bank lines (every non-frozen company, bypass=${r.bypass}); ${r.applied ? `0 matched to a missing / not-live document; ${expectedTriggers().length} constraint triggers installed` : "202615360600 not yet applied — dead-link check runs once it is"}; 0 live match rows on a released line`);
