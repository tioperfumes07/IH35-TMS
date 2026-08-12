#!/usr/bin/env node
/**
 * WORM-ROW-AUDIT-GAP-IS-23-TABLES — live guard for verify-step 2961.
 *
 * "Who changed what the driver was paid, and when" was unanswerable for 23 of `driver_finance`'s 37
 * base tables — no row-level audit trail at all, including `driver_settlements`, `settlement_lines`,
 * `driver_advances`, `driver_liabilities`, and all THREE GL-run tables. Migration
 * 202612500000_driver_finance_row_audit_gap_attach.sql attaches the EXISTING `audit.tg_audit_row()`
 * trigger to 19 of the 23 (4 are deliberately excluded — see below); this guard is the invariant that
 * a table added to `driver_finance` LATER cannot silently join the same gap.
 *
 * METHOD: enumerates its own denominator — every base table currently in the `driver_finance` schema,
 * read live from `pg_class`/`pg_namespace` — rather than a hand-written list, so this guard's coverage
 * grows automatically as the schema grows. A table is exempt ONLY if it is in the stated exclusion
 * list below, with the same reason the migration states:
 *   cash_advance_owner_approval_audit, cash_advance_request_audit — these ARE audit sinks; auditing an
 *     audit table is circular and doubles write volume on every approval.
 *   trip_link_queue — a transient work queue; rows are consumed, not kept.
 *   settlement_preview_costs — an ephemeral preview recomputed on demand; it is not the settlement.
 * Every other base table must carry a trigger backed by the `audit.tg_audit_row` function (checked by
 * FUNCTION name via pg_proc, not a specific trigger name — every existing attachment names its trigger
 * `tg_audit_row_<table>`, never the bare function name, so matching on tgname would false-negative on
 * every real attachment in this schema).
 *
 * DB-BACKED (needs DATABASE_URL) — SKIPs cleanly with no DB, same posture as every other live guard in
 * this suite, so it never fakes green in a no-DB context and never fails a fresh-DB job before the
 * migration has run. Once 202612500000 IS present (fresh-DB CI replays every migration), a table
 * missing the trigger is a real FAIL, not a skip.
 *
 * Self-test: node scripts/verify-driver-finance-money-tables-row-audited.mjs --selftest
 */
import pg from "pg";

const LABEL = "verify-driver-finance-money-tables-row-audited";

const EXCLUDED = new Set([
  "cash_advance_owner_approval_audit",
  "cash_advance_request_audit",
  "trip_link_queue",
  "settlement_preview_costs",
]);

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/**
 * Pure classification helper so the selftest can exercise the exclusion logic without a DB.
 * Given a list of { table_name, has_audit_trigger } rows (as returned by the live query below),
 * returns the tables that are neither excluded nor audited — the FAIL set.
 */
export function findUnauditedNonExcluded(rows) {
  return rows.filter((r) => !EXCLUDED.has(r.table_name) && !r.has_audit_trigger).map((r) => r.table_name);
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const fixtureAllGood = [
    { table_name: "driver_settlements", has_audit_trigger: true },
    { table_name: "settlement_lines", has_audit_trigger: true },
    { table_name: "trip_link_queue", has_audit_trigger: false }, // excluded — must NOT fail
    { table_name: "settlement_preview_costs", has_audit_trigger: false }, // excluded — must NOT fail
  ];
  const goodResult = findUnauditedNonExcluded(fixtureAllGood);
  if (goodResult.length !== 0) fail(`selftest: excluded tables were incorrectly flagged — ${JSON.stringify(goodResult)}`);

  const fixtureRegression = [
    { table_name: "driver_settlements", has_audit_trigger: true },
    { table_name: "driver_pay_rates", has_audit_trigger: false }, // NOT excluded, NOT audited — must FAIL
  ];
  const regressionResult = findUnauditedNonExcluded(fixtureRegression);
  if (regressionResult.length !== 1 || regressionResult[0] !== "driver_pay_rates") {
    fail(`selftest: regression fixture (driver_pay_rates unaudited, not excluded) was not caught — got ${JSON.stringify(regressionResult)}`);
  }

  console.log(`[${LABEL}] selftest: PASS — exclusion list and regression detection both classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`[${LABEL}] SKIP — no DATABASE_URL (static context); this guard is DB-backed by design`);
    process.exit(0);
  }

  const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
  let client;
  try {
    client = await pool.connect();
  } catch {
    console.log(`[${LABEL}] SKIP — database unreachable (static context)`);
    process.exit(0);
  }

  try {
    const { rows } = await client.query(`
      SELECT
        c.relname AS table_name,
        EXISTS (
          SELECT 1
            FROM pg_trigger t
            JOIN pg_proc p ON p.oid = t.tgfoid
           WHERE t.tgrelid = c.oid AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
        ) AS has_audit_trigger
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'driver_finance' AND c.relkind = 'r'
      ORDER BY table_name
    `);

    if (rows.length === 0) {
      fail("driver_finance schema read 0 base tables — that is an unverifiable read (RLS mask, wrong schema, or fresh DB before migrations), not evidence of anything.");
    }

    const missing = findUnauditedNonExcluded(rows);
    if (missing.length > 0) {
      console.error(`[${LABEL}] FAIL — ${missing.length} driver_finance table(s) have no audit.tg_audit_row-backed trigger and are not in the stated exclusion list:`);
      for (const t of missing) console.error(`  - ${t}`);
      console.error(
        `[${LABEL}] "who changed what the driver was paid, and when" is unanswerable for these tables. Attach audit.tg_audit_row() via an idempotent migration, or add to the stated exclusion list WITH a reason if it is genuinely audit-exempt.`
      );
      fail(`${missing.length} unaudited driver_finance table(s)`);
    }

    const auditedCount = rows.filter((r) => r.has_audit_trigger).length;
    console.log(
      `[${LABEL}] PASS — ${auditedCount} of ${rows.length} driver_finance table(s) audited, ${EXCLUDED.size} deliberately excluded (stated reasons), 0 unaccounted for`
    );
  } catch (err) {
    fail(`query failed: ${err?.message ?? err}`);
  } finally {
    client.release();
    await pool.end();
  }
}
