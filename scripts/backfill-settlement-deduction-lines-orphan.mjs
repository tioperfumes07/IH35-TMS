#!/usr/bin/env node
/**
 * ENG-01c (443.322) — backfill orphaned settlement_lines deduction rows
 *
 * Finds every active USMCA settlement_lines row with line_type='deduction' and
 * source_table='driver_finance.driver_settlement_deductions' where the referenced DSD row
 * does not exist (or source_table/source_reference_id is NULL), then creates the missing
 * DSD row and wires source_table + source_reference_id.
 *
 * Default: DRY-RUN (prints what would be fixed, writes nothing).
 * Pass --apply to write. Requires OWNER_AUTH_ID env var when --apply is set.
 *
 * Usage:
 *   node scripts/backfill-settlement-deduction-lines-orphan.mjs
 *   OWNER_AUTH_ID=<user-uuid> node scripts/backfill-settlement-deduction-lines-orphan.mjs --apply
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DSD_SOURCE = "driver_finance.driver_settlement_deductions";
const APPLY = process.argv.includes("--apply");
const OWNER_AUTH_ID = process.env.OWNER_AUTH_ID ?? null;

if (APPLY && !OWNER_AUTH_ID) {
  console.error("ERROR: --apply requires OWNER_AUTH_ID env var (the authenticated user running the backfill)");
  process.exit(1);
}

const { client, pool } = await requireLiveDbOrExit({ label: "backfill-settlement-deduction-lines-orphan" });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  // Find orphaned deduction lines: source_table set to DSD but DSD row missing,
  // OR source_table/source_reference_id is NULL (pre-fix lines with no ref at all).
  const orphanRes = await client.query(
    `SELECT
       sl.id          AS line_id,
       sl.settlement_id,
       sl.description,
       sl.amount,
       sl.source_table,
       sl.source_reference_id,
       ds.display_id,
       ds.operating_company_id,
       ds.driver_id,
       ds.is_sample_data
     FROM driver_finance.settlement_lines sl
     JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
     LEFT JOIN driver_finance.driver_settlement_deductions dsd
       ON dsd.id = sl.source_reference_id AND sl.source_table = $2
     WHERE sl.operating_company_id = $1::uuid
       AND sl.line_type = 'deduction'
       AND sl.is_active = true
       AND sl.voided_at IS NULL
       AND (
         -- source_table points to DSD but no DSD row exists
         (sl.source_table = $2 AND sl.source_reference_id IS NOT NULL AND dsd.id IS NULL)
         OR
         -- legacy lines with no DSD linkage at all
         (sl.source_table IS NULL AND sl.source_reference_id IS NULL)
       )
     ORDER BY ds.display_id, sl.description`,
    [USMCA, DSD_SOURCE]
  );

  const rows = orphanRes.rows;
  if (rows.length === 0) {
    console.log("backfill-settlement-deduction-lines-orphan: 0 orphaned rows found — nothing to do");
    await client.query("ROLLBACK");
    process.exit(0);
  }

  console.log(`backfill-settlement-deduction-lines-orphan: found ${rows.length} orphaned deduction line(s)`);
  for (const r of rows) {
    const amountCents = Math.round(Math.abs(Number(r.amount)) * 100);
    console.log(`  ${APPLY ? "APPLY" : "DRY-RUN"} ${r.display_id} line ${r.line_id}: "${r.description}" $${r.amount} (${amountCents}c)`);
    if (APPLY) {
      if (amountCents <= 0) {
        console.log(`    SKIP: amount ${amountCents}c is not positive`);
        continue;
      }
      // Create DSD row
      const dsdRes = await client.query(
        `INSERT INTO driver_finance.driver_settlement_deductions
           (operating_company_id, driver_id, deduction_type, amount_cents, reason,
            applied_to_settlement_id, created_by_user_id, remaining_balance_cents, status)
         VALUES ($1::uuid, $2::uuid, 'other', $3, $4, $5::uuid, $6::uuid, $3, 'pending')
         RETURNING id`,
        [r.operating_company_id, r.driver_id, amountCents,
         r.description?.trim() || "Settlement deduction (backfill)",
         r.settlement_id, OWNER_AUTH_ID]
      );
      const dsdId = dsdRes.rows[0]?.id;
      if (!dsdId) throw new Error(`DSD INSERT returned no row for line ${r.line_id}`);
      // Wire settlement_lines row
      await client.query(
        `UPDATE driver_finance.settlement_lines
            SET source_table = $1, source_reference_id = $2::uuid, updated_at = now()
          WHERE id = $3::uuid`,
        [DSD_SOURCE, dsdId, r.line_id]
      );
      console.log(`    → created DSD ${dsdId}`);
    }
  }

  if (APPLY) {
    await client.query("COMMIT");
    console.log(`backfill-settlement-deduction-lines-orphan: APPLIED ${rows.length} row(s) — committed`);
  } else {
    await client.query("ROLLBACK");
    console.log(`backfill-settlement-deduction-lines-orphan: DRY-RUN complete — re-run with --apply to commit`);
  }
} finally {
  client.release();
  await pool.end();
}
