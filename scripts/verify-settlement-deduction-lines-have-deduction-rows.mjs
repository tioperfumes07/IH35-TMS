#!/usr/bin/env node
/**
 * ENG-01c (443.322) step 18789 — live guard
 *
 * For every active (non-voided) USMCA settlement_lines row with line_type='deduction'
 * and source_table = 'driver_finance.driver_settlement_deductions', the DSD row must exist.
 *
 * Root cause: settlements.routes.ts and settlements-mvp.routes.ts legacy POST routes
 * inserted settlement_lines deduction rows WITHOUT creating a driver_settlement_deductions row.
 * Fix (ENG-01c): both writers now atomically create DSD row + wire source_table/source_reference_id.
 * Backfill: scripts/backfill-settlement-deduction-lines-orphan.mjs repairs pre-fix rows.
 *
 * Baseline: 0 failures (verified 2026-10-24 on prod br-fancy-credit-akjnd07a).
 *
 * Usage: node scripts/verify-settlement-deduction-lines-have-deduction-rows.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-deduction-lines-have-deduction-rows";
export const REQUIRES_LIVE_DB =
  "driver_finance.settlement_lines + driver_finance.driver_settlement_deductions — fails closed with no DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DSD_SOURCE = "driver_finance.driver_settlement_deductions";

/* ── self-test ─────────────────────────────────────────────────────────────── */

export function isOrphaned(sourceTable, sourceReferenceId, dsdId) {
  if (sourceTable !== DSD_SOURCE) return false;
  return !dsdId;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["non-deduction source_table → not orphaned", !isOrphaned("other_table", "uuid-1", null)],
    ["DSD source_table + no DSD id → orphaned", isOrphaned(DSD_SOURCE, "uuid-1", null)],
    ["DSD source_table + DSD id present → not orphaned", !isOrphaned(DSD_SOURCE, "uuid-1", "uuid-2")],
    ["null source_table (pre-fix, no ref) → not in scope", !isOrphaned(null, null, null)],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

/* ── live run ──────────────────────────────────────────────────────────────── */

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  // Completeness discriminator: total active deduction lines with DSD source ref
  const totalRes = await client.query(
    `SELECT COUNT(*) AS n
       FROM driver_finance.settlement_lines sl
       JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      WHERE sl.operating_company_id = $1::uuid
        AND sl.line_type = 'deduction'
        AND sl.source_table = $2
        AND sl.source_reference_id IS NOT NULL
        AND sl.is_active = true
        AND sl.voided_at IS NULL`,
    [USMCA, DSD_SOURCE]
  );
  const total = Number(totalRes.rows[0].n);

  if (total === 0) {
    console.log(`${LABEL}: LIVE SKIP — 0 DSD-linked deduction lines found; no data to verify`);
    await client.query("COMMIT");
    process.exit(0);
  }

  const orphanRes = await client.query(
    `SELECT
       ds.display_id,
       sl.id          AS line_id,
       sl.description,
       sl.amount,
       sl.source_reference_id AS dsd_ref
     FROM driver_finance.settlement_lines sl
     JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
     LEFT JOIN driver_finance.driver_settlement_deductions dsd ON dsd.id = sl.source_reference_id
     WHERE sl.operating_company_id = $1::uuid
       AND sl.line_type = 'deduction'
       AND sl.source_table = $2
       AND sl.source_reference_id IS NOT NULL
       AND sl.is_active = true
       AND sl.voided_at IS NULL
       AND dsd.id IS NULL
     ORDER BY ds.display_id, sl.description`,
    [USMCA, DSD_SOURCE]
  );

  await client.query("COMMIT");

  const violations = orphanRes.rows;
  if (violations.length > 0) {
    console.error(
      `${LABEL}: LIVE FAIL — ${violations.length} settlement_lines deduction row(s) have no driver_settlement_deductions row`
    );
    for (const r of violations) {
      console.error(
        `  ✗ ${r.display_id} line ${r.line_id}: "${r.description}" $${r.amount} — missing DSD ${r.dsd_ref}`
      );
    }
    console.error(`  → Run: node scripts/backfill-settlement-deduction-lines-orphan.mjs [--apply]`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — 0 orphaned deduction lines (${total} DSD-linked line(s) checked)`
  );
} finally {
  client.release();
  await pool.end();
}
