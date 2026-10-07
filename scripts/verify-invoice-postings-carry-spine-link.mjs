#!/usr/bin/env node
/**
 * Standing order 2026-10-03 (CC-3: "invoice spine path, 48 postings $178,938.00"). Every journal_entry_posting
 * sourced from an invoice carries a transaction_source_links row (the spine), and no live posting can lose its last
 * link. The 48 measured were written linked by postVoidReversal and STRIPPED by the AUTH-177 purge
 * (audit.row_changes: 48 DELETEs at 2026-09-30 17:28:12Z) — the purge removed the voided invoices and their links but
 * left both legs of each reversal pair live. FAILS IF:
 *   static — migration 202615330906's deferred constraint trigger is no longer declared / deferred;
 *   live   — the trigger is missing or disabled on accounting.transaction_source_links, or the USMCA count of
 *            invoice-sourced postings with no link exceeds CEILING (committed, shrink-only).
 * Counts under SET LOCAL app.bypass_rls = 'lucia' (named per the count law). No database = FAIL (money guard).
 * Run: node scripts/verify-invoice-postings-carry-spine-link.mjs [--selftest]
 */
export const REQUIRES_LIVE_DB = "Neon live verification required";

import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-invoice-postings-carry-spine-link";
const MIGRATION = "db/migrations/202615330906_live_posting_keeps_its_spine_link.sql";
const TRIGGER = "trg_live_posting_keeps_spine_link";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// SHRINK-ONLY. 48 = the 24 AUTH-177-stripped "Void reversal of invoice" JEs (2 lines each, $178,938.00 gross,
// 2026-09-25), purge population. Lower it the moment the count drops; never raise it.
export const CEILING = 48;

export function auditStatic(sql) {
  const f = [];
  if (!new RegExp(`CREATE CONSTRAINT TRIGGER ${TRIGGER}`).test(sql)) f.push(`${MIGRATION} no longer creates ${TRIGGER}`);
  if (!/DEFERRABLE INITIALLY DEFERRED/.test(sql)) f.push("the trigger is no longer deferred (a governed purge would be refused)");
  if (!/AFTER DELETE OR UPDATE OF journal_entry_posting_id/.test(sql)) f.push("the trigger no longer covers DELETE and re-pointing UPDATE");
  return f;
}
export function auditLive(trigger, unlinked) {
  const f = [];
  if (!trigger) f.push(`${TRIGGER} is not on accounting.transaction_source_links`);
  else if (trigger.tgenabled === "D") f.push(`${TRIGGER} is DISABLED`);
  if (unlinked > CEILING) f.push(`${unlinked} USMCA invoice-sourced postings carry no spine link (ceiling ${CEILING}) — a NEW unlinked posting`);
  return f;
}

const sql = readFileSync(MIGRATION, "utf8");
if (process.argv.includes("--selftest")) {
  const ok = { tgenabled: "O" };
  const cases = [
    ["static real", auditStatic(sql).length === 0],
    ["static trigger removed", auditStatic(sql.replace(`CREATE CONSTRAINT TRIGGER ${TRIGGER}`, "x")).length === 1],
    ["static not deferred", auditStatic(sql.replace("DEFERRABLE INITIALLY DEFERRED", "")).length === 1],
    ["live at ceiling", auditLive(ok, CEILING).length === 0],
    ["live new unlinked", auditLive(ok, CEILING + 1).length === 1],
    ["live trigger missing", auditLive(null, 0).length === 1],
    ["live trigger disabled", auditLive({ tgenabled: "D" }, 0).length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`selftest FAIL: ${bad.map(([n]) => n).join(", ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = auditStatic(sql);
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION.split("/").pop()])).rowCount > 0;
  const trigger = (await c.query(`SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'accounting.transaction_source_links'::regclass AND tgname = $1`, [TRIGGER])).rows[0] ?? null;
  const r = (await c.query(`
    SELECT count(*)::int n, coalesce(sum(p.amount_cents), 0)::bigint cents FROM accounting.journal_entry_postings p
     WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'invoice'
       AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = p.id)`, [USMCA])).rows[0];
  if (!applied) console.log(`${LABEL}: PENDING DEPLOY — migration not in the ledger; trigger check skipped`);
  fails.push(...auditLive(applied ? trigger : { tgenabled: "O" }, r.n));
  console.log(`${LABEL}: ${r.n} unlinked invoice-sourced posting(s), $${(Number(r.cents) / 100).toFixed(2)} (ceiling ${CEILING})`);
  if (r.n < CEILING) console.log(`${LABEL}: the count dropped — lower CEILING to ${r.n}`);
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS`);
