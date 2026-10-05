#!/usr/bin/env node
/**
 * ROUND 363-CC3-A (LAW 363.2) — FAILS IF a load-born row can exist without its load, or a reversal cannot walk back to
 * the load its original belonged to. Pairs with CC-1's verify-every-load-born-posting-carries-its-load (the writers).
 *   static — migration 202615330931 still declares the five refusals (posting, from_load invoice, driver bill,
 *            revenue-recognition posting, load charge line).
 *   live, every non-frozen company:
 *     (1) the five refusal triggers exist and are enabled;
 *     (2) load-born documents with no load = exactly the PINNED list below (shrink-only; a new one FAILS, a pinned one
 *         that gained its load or left FAILS until it is removed from the list);
 *     (3) postings written since the stamp went live (202615350500 applied) whose resolver names a load: 0 with a NULL
 *         stamp;
 *     (4) FINISH TEST, both directions, for every reversal line written since then: reversal -> original
 *         (reversal_of_line_id) -> the original's load equals the reversal's load (the reverse direction, load -> its
 *         postings, is the indexed load_id itself). Pre-stamp postings (all purge population) are reported, never failed.
 * No database = FAIL. Run: node scripts/verify-every-load-born-document-and-posting-traces-to-its-load.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";

export const REQUIRES_LIVE_DB = "the load refusals and the reversal-to-load walk are live ledger lineage";
const LABEL = "verify-every-load-born-document-and-posting-traces-to-its-load";
const MIGRATION = "db/migrations/202615330931_load_born_rows_refuse_a_null_load.sql";
const STAMP_MIGRATION = "202615350500_journal_entry_postings_load_id_stamp.sql";
const BACKFILL_MIGRATION = "202615390931_posting_load_id_backfill_where_provable.sql";

export const TRIGGERS = [
  ["accounting.journal_entry_postings", "trg_load_born_posting_carries_its_load"],
  ["accounting.invoices", "trg_from_load_invoice_carries_its_load"],
  ["driver_finance.driver_bills", "trg_driver_bill_carries_its_load"],
  ["accounting.load_revenue_recognition_postings", "trg_revrec_posting_carries_its_load"],
  ["dispatch.load_charge_lines", "trg_load_charge_line_carries_its_load"],
];

/** Load-born documents measured with no load on 2026-10-03, provably un-attributable (ROUND 361 §B). Shrink-only. */
export const PINNED_LOADLESS = [
  // 2026-10-05: accounting.invoices display 010 now carries a load — pin removed (shrink-only).
];

export function migrationGaps(sql) {
  return TRIGGERS.filter(([, t]) => !new RegExp(`CREATE (CONSTRAINT )?TRIGGER ${t}\\b`).test(sql)).map(([tbl, t]) => `${MIGRATION} no longer declares ${t} on ${tbl}`);
}

/** facts: { triggers: Set<name>, loadless: [{table, display}], unstamped, walk: {reversals, broken} } */
export function liveGaps(x, pins = PINNED_LOADLESS) {
  const f = [];
  for (const [tbl, t] of TRIGGERS) if (!x.triggers.has(t)) f.push(`refusal ${t} missing or disabled on ${tbl}`);
  const key = (r) => `${r.table}:${r.display}`;
  const pinned = new Set(pins.map(key));
  for (const r of x.loadless) if (!pinned.has(key(r))) f.push(`load-born ${r.table} ${r.display} has no load and is not on the pinned list`);
  const seen = new Set(x.loadless.map(key));
  for (const p of pins) if (!seen.has(key(p))) f.push(`pinned ${p.table} ${p.display} no longer lacks a load — remove it from PINNED_LOADLESS (shrink-only)`);
  if (x.unstamped > 0) f.push(`${x.unstamped} posting(s) written since the stamp went live name a load in their resolver but carry load_id NULL`);
  if (x.walk.broken > 0) f.push(`${x.walk.broken} of ${x.walk.reversals} reversal line(s) cannot walk reversal -> original -> load, or the load does not list them`);
  return f;
}

const sql = readFileSync(MIGRATION, "utf8");
if (process.argv.includes("--selftest")) {
  const all = new Set(TRIGGERS.map(([, t]) => t));
  const clean = { triggers: all, loadless: [], unstamped: 0, walk: { reversals: 3, broken: 0 } };
  const cases = [
    ["migration real", migrationGaps(sql).length === 0],
    ["refusal dropped from migration", migrationGaps(sql.replace("CREATE TRIGGER trg_driver_bill_carries_its_load", "-- x")).length === 1],
    ["live clean", liveGaps(clean).length === 0],
    ["trigger disabled", liveGaps({ ...clean, triggers: new Set([...all].slice(1)) }).length === 1],
    ["new load-less document", liveGaps({ ...clean, loadless: [{ table: "driver_finance.driver_bills", display: "x" }] }).length === 1],
    // Shrink-only contract: a pin whose row is no longer load-less must FAIL until removed.
    ["pinned row fixed but still pinned", liveGaps({ ...clean, loadless: [] }, [{ table: "accounting.invoices", display: "ghost" }]).length === 1],
    ["unstamped posting", liveGaps({ ...clean, unstamped: 2 }).length === 1],
    ["broken walk", liveGaps({ ...clean, walk: { reversals: 3, broken: 1 } }).length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.map(([n]) => n).join(", ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = migrationGaps(sql);
const facts = await withUnscopedReadOnly(LABEL, async (c) => {
  const applied = (await c.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION.split("/").pop()])).rows[0];
  const stampAt = (await c.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename = $1`, [STAMP_MIGRATION])).rows[0]?.applied_at ?? null;
  const triggers = new Set((await c.query(`SELECT tgname FROM pg_trigger WHERE tgname = ANY($1) AND tgenabled <> 'D'`, [TRIGGERS.map(([, t]) => t)])).rows.map((r) => r.tgname));
  const loadless = (await c.query(`
    SELECT 'accounting.invoices' AS table, i.display_id AS display FROM accounting.invoices i
     WHERE i.invoice_type = 'from_load' AND i.source_load_id IS NULL AND ${NOT_FROZEN_SQL("i.operating_company_id")}
    UNION ALL SELECT 'driver_finance.driver_bills', b.id::text FROM driver_finance.driver_bills b WHERE b.load_id IS NULL AND ${NOT_FROZEN_SQL("b.operating_company_id")}
    UNION ALL SELECT 'accounting.load_revenue_recognition_postings', r.id::text FROM accounting.load_revenue_recognition_postings r WHERE r.load_id IS NULL AND ${NOT_FROZEN_SQL("r.operating_company_id")}
    UNION ALL SELECT 'dispatch.load_charge_lines', l.id::text FROM dispatch.load_charge_lines l WHERE l.load_id IS NULL AND ${NOT_FROZEN_SQL("l.operating_company_id")}`)).rows;
  // 363-CC3-A: once 202615390931 has stamped every provable EXISTING posting, the unstamped / broken-walk rules hold for
  // ALL TIME, not only since the stamp; history without a provable load (documents gone) stays reported.
  const backfilled = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [BACKFILL_MIGRATION])).rowCount > 0;
  const since = backfilled ? "-infinity" : stampAt ?? "infinity";
  const unstamped = (await c.query(`
    SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
     WHERE p.created_at >= $1::timestamptz AND p.load_id IS NULL AND ${NOT_FROZEN_SQL("p.operating_company_id")}
       AND accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id::text, p.source_transaction_line_id::text, p.reversal_of_line_id) IS NOT NULL`, [since])).rows[0].n;
  const walk = (await c.query(`
    SELECT count(*)::int AS reversals,
           count(*) FILTER (WHERE o.id IS NULL OR r.load_id IS DISTINCT FROM o.load_id)::int AS broken
      FROM accounting.journal_entry_postings r
      LEFT JOIN accounting.journal_entry_postings o ON o.id = r.reversal_of_line_id
     WHERE r.reversal_of_line_id IS NOT NULL AND r.created_at >= $1::timestamptz AND ${NOT_FROZEN_SQL("r.operating_company_id")}`, [since])).rows[0];
  const history = (await c.query(`
    SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
     WHERE p.created_at < $1::timestamptz AND p.load_id IS NULL AND ${NOT_FROZEN_SQL("p.operating_company_id")}`, [since])).rows[0].n;
  return { applied: Boolean(applied), stampAt, backfilled, triggers, loadless, unstamped, walk, history };
});
const live = liveGaps(facts);
if (!facts.applied) {
  console.log(`${LABEL}: PENDING DEPLOY — ${MIGRATION.split("/").pop()} not in the ledger; live check reported, not enforced (${live.length} gap(s) today)`);
} else {
  fails.push(...live);
}
console.log(`${LABEL}: load-less load-born documents ${facts.loadless.length} (pinned ${PINNED_LOADLESS.length}); ${facts.backfilled ? "postings (all time, backfill applied)" : "postings since the stamp"} unstamped ${facts.unstamped}; reversals ${facts.backfilled ? "(all time)" : "since the stamp"} ${facts.walk.reversals}, broken walks ${facts.walk.broken}${facts.backfilled ? "" : `; pre-stamp postings without a load ${facts.history} (purge population, reported)`}`);
report(LABEL, fails, "every load-born row carries its load and every reversal walks back to it");
