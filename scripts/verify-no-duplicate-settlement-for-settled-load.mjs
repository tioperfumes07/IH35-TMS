#!/usr/bin/env node
/**
 * 443.310 — no settlement with 0 lines whose audit last_load_id is already on another live
 * settlement for the same driver.
 *
 * ROOT CAUSE: tour-close engine re-fired on a load already settled. The fallback in
 * closeLoadBookendedSettlementForDriver (settlements-load-bookended.service.ts) opened a fresh
 * settlement when it found no OPEN one, even though the load already had settlement_lines on a
 * closed settlement. Three duplicates created: P-0123/P-0124/P-0125 (0 lines, $0, NULL created_by).
 *
 * FIX: closeLoadBookendedSettlementForDriver now checks for existing settlement_lines before
 * calling openLoadBookendedSettlement; if found it emits settlement.reopen_refused_load_already_settled
 * and returns 0 (no-op). Guard monitors that the duplicate class stays at 0.
 *
 * Usage: node scripts/verify-no-duplicate-settlement-for-settled-load.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-duplicate-settlement-for-settled-load";
export const REQUIRES_LIVE_DB =
  "live-data money guard; fails closed via requireLiveDbOrExit with no DATABASE_URL";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

/**
 * Pure check — a settlement is a duplicate if:
 * 1. It has 0 active settlement_lines
 * 2. Its driver has ANOTHER non-voided settlement with settlement_lines for the same load
 *    (detected via audit payload last_load_id OR first_load_id)
 */
export function isDuplicate(row) {
  return (
    Number(row.line_count) === 0 &&
    row.other_settlement_id != null
  );
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["0 lines + other settlement = duplicate", isDuplicate({ line_count: 0, other_settlement_id: "abc" })],
    ["0 lines + no other settlement = not duplicate", !isDuplicate({ line_count: 0, other_settlement_id: null })],
    ["has lines + other settlement = not duplicate", !isDuplicate({ line_count: 1, other_settlement_id: "abc" })],
    ["has lines + no other settlement = not duplicate", !isDuplicate({ line_count: 2, other_settlement_id: null })],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const totalRes = await client.query(
    `SELECT count(*) AS n FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
    [USMCA_COMPANY_ID]
  );
  const total = Number(totalRes.rows[0].n);
  if (total === 0) {
    console.error(`${LABEL}: LIVE FAIL — 0 driver_settlements rows; completeness discriminator says instrument problem`);
    process.exit(1);
  }

  // Find settlements with 0 active lines whose driver has another non-voided settlement
  // with settlement_lines on the same load (first_load_id or last_load_id match).
  const dupRes = await client.query(
    `
      SELECT
        ds.id::text AS settlement_id,
        ds.display_id,
        ds.driver_id::text,
        ds.status,
        ds.first_load_id::text,
        ds.last_load_id::text,
        ds.created_at::text,
        COUNT(sl.id) AS line_count,
        (
          SELECT ds2.id::text
          FROM driver_finance.driver_settlements ds2
          JOIN driver_finance.settlement_lines sl2
            ON sl2.settlement_id = ds2.id
           AND sl2.is_active = true
           AND sl2.load_id IN (ds.first_load_id, ds.last_load_id)
          WHERE ds2.operating_company_id = ds.operating_company_id
            AND ds2.driver_id = ds.driver_id
            AND ds2.id <> ds.id
            AND ds2.voided_at IS NULL
          LIMIT 1
        ) AS other_settlement_id
      FROM driver_finance.driver_settlements ds
      LEFT JOIN driver_finance.settlement_lines sl
        ON sl.settlement_id = ds.id AND sl.is_active = true
      WHERE ds.operating_company_id = $1::uuid
        AND ds.voided_at IS NULL
        AND ds.settlement_model = 'load_bookended'
        AND (ds.first_load_id IS NOT NULL OR ds.last_load_id IS NOT NULL)
      GROUP BY ds.id, ds.display_id, ds.driver_id, ds.status, ds.first_load_id, ds.last_load_id, ds.created_at
      HAVING COUNT(sl.id) = 0
    `,
    [USMCA_COMPANY_ID]
  );

  await client.query("COMMIT");

  const duplicates = dupRes.rows.filter(isDuplicate);
  if (duplicates.length > 0) {
    console.error(`${LABEL}: LIVE FAIL — ${duplicates.length} duplicate settlement(s) with 0 lines whose load is already on another settlement:`);
    for (const r of duplicates) {
      console.error(`  ✗ ${r.settlement_id} (${r.display_id ?? "no-P"}) driver ${r.driver_id} status=${r.status} first_load=${r.first_load_id ?? "-"} last_load=${r.last_load_id ?? "-"} other=${r.other_settlement_id}`);
    }
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — 0 duplicate load-bookended settlements (${total} total settlements checked, ${dupRes.rows.length} with 0 lines)`);
} finally {
  client.release();
  await pool.end();
}
