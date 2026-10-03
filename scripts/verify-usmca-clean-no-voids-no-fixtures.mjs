#!/usr/bin/env node
// ROUND 326 (CC-1) — owner law 2026-10-02 CLEAN APP: USMCA holds no sample / demo / test / E2E rows, no voided record,
// no cancelled shell. Live (read-only, FAIL-CLOSED without DATABASE_URL), shrink-only against
// verify-usmca-clean-no-voids-no-fixtures.baseline.json (measured 2026-10-02, before the complete delete engine runs):
// any count above its baseline fails; settlement docrefs 5817 and 5818 must still exist (unidentified, kept for the owner).
// The delete engine is scripts/ops/2026-10-02-cc1-r326-complete-delete.ts --scope=usmca-clean.
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-usmca-clean-no-voids-no-fixtures";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TEST_ID = String.raw`(^|[^a-z])(e2e|demo|test|sample|fixture|practice|example)([^a-z]|$)`;
const base = JSON.parse(readFileSync(new URL("./verify-usmca-clean-no-voids-no-fixtures.baseline.json", import.meta.url), "utf8"));
export const REQUIRES_LIVE_DB = "USMCA cleanliness is a live fact — fails closed without a database";

/** Pure: shrink-only comparison against the committed baseline (ROUND 390.1 — wired; was an orphan). */
export function evaluate(counts, baseline, kept) {
  const problems = [];
  for (const [k, v] of Object.entries(counts)) {
    const b = baseline.counts[k];
    if (b === undefined) problems.push(`${k}: no baseline`);
    else if (v > b) problems.push(`${k}: ${v} (baseline ${b}) — a new ${k.replace(/_/g, " ")} in USMCA`);
  }
  if (kept !== 2) problems.push(`settlement docrefs 5817 / 5818: ${kept} of 2 present — they are kept for the owner, never deleted`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const b = { counts: { test_identifiers: 2, sample_rows: 6 } };
  const cases = [
    ["at baseline passes", evaluate({ test_identifiers: 2, sample_rows: 6 }, b, 2).length === 0],
    ["a NEW test identifier fails (the 2026-10-02 E2E customers)", evaluate({ test_identifiers: 4, sample_rows: 6 }, b, 2).some((x) => x.startsWith("test_identifiers"))],
    ["below baseline passes (shrink)", evaluate({ test_identifiers: 0, sample_rows: 0 }, b, 2).length === 0],
    ["a missing kept docref fails", evaluate({ test_identifiers: 2, sample_rows: 6 }, b, 1).some((x) => x.includes("5817"))],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  // A fresh verify database carries no USMCA company: nothing production-shaped to measure — say so, never call it proof.
  if ((await client.query(`SELECT 1 FROM org.companies WHERE id = $1::uuid`, [USMCA])).rows.length === 0) {
    console.log(`${LABEL}: DATABASE PHASE — USMCA company absent (fresh verify DB); the shrink-only rule is selftested, NOT live proof.`);
    process.exitCode = 0;
  } else {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const sampleTables = (await client.query(
    `SELECT c.table_schema || '.' || c.table_name AS t FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.column_name = 'is_sample_data'
        AND EXISTS (SELECT 1 FROM information_schema.columns o WHERE o.table_schema = c.table_schema AND o.table_name = c.table_name AND o.column_name = 'operating_company_id')`
  )).rows.map((r) => r.t);
  let sample = 0;
  for (const t of sampleTables) sample += Number((await client.query(`SELECT count(*)::int n FROM ${t} WHERE operating_company_id = $1::uuid AND is_sample_data IS TRUE`, [USMCA])).rows[0].n);
  const one = async (sql) => Number((await client.query(sql, [USMCA])).rows[0].n);
  const counts = {
    sample_rows: sample,
    test_identifiers: await one(`SELECT (SELECT count(*) FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number ~* '${TEST_ID}') + (SELECT count(*) FROM mdata.customers WHERE operating_company_id = $1::uuid AND customer_name ~* '${TEST_ID}') AS n`),
    voided_invoices: await one(`SELECT count(*)::int n FROM accounting.invoices WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL`),
    voided_expenses: await one(`SELECT count(*)::int n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL`),
    voided_journal_entries: await one(`SELECT count(*)::int n FROM accounting.journal_entries WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL`),
    voided_settlements: await one(`SELECT count(*)::int n FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL`),
    inactive_revrec_postings: await one(`SELECT count(*)::int n FROM accounting.load_revenue_recognition_postings WHERE operating_company_id = $1::uuid AND (voided_at IS NOT NULL OR NOT is_active)`),
    cancelled_load_shells: await one(`SELECT count(*)::int n FROM mdata.loads WHERE operating_company_id = $1::uuid AND status::text = 'cancelled'`),
  };
  const kept = Number((await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND source_document_ref IN ('5817', '5818')`, [USMCA])).rows[0].n);
  await client.query("ROLLBACK");
  const problems = evaluate(counts, base, kept);
  if (problems.length) { console.error(`${LABEL}: LIVE FAIL — ${problems.join("; ")}`); process.exitCode = 1; }
  else {
  const dirty = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
  console.log(`${LABEL}: LIVE PASS — 0 above baseline (measured_at ${base.measured_at}); docrefs 5817 / 5818 present. Still to clean: ${dirty.join(", ") || "nothing"}.`);
  }
  }
} finally {
  client.release();
  await pool.end();
}
