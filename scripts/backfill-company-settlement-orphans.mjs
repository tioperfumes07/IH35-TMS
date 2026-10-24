#!/usr/bin/env node
/**
 * ENG-40 (443.328) — backfill missing company settlements for closed, load_bookended USMCA
 * driver settlements that have no row in accounting.company_settlement_driver_settlements.
 *
 * Root cause: the settlement-payrun-close.service.ts close path was not always calling
 * closeCompanySettlementAlongsideDriverSettlement (wired in the "one close, two settlements"
 * fix). Settlements closed before or bypassing that code have no company settlement header.
 *
 * Algorithm (mirrors closeCompanySettlementAlongsideDriverSettlement's TypeScript logic):
 *   1. Find all orphaned driver settlements (closed + load_bookended + no CSDS link)
 *   2. For each: display_id = COALESCE(source_document_ref, display_id)
 *   3. Find-or-create accounting.company_settlements by that display_id
 *   4. INSERT into company_settlement_driver_settlements ON CONFLICT DO NOTHING
 *   5. UPDATE company_settlements status/period/closed_at based on linked driver settlements
 *
 * Default: DRY-RUN. Pass --apply to write. Requires OWNER_AUTH_ID env var when --apply.
 *
 * Usage:
 *   node scripts/backfill-company-settlement-orphans.mjs
 *   OWNER_AUTH_ID=<user-uuid> node scripts/backfill-company-settlement-orphans.mjs --apply
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const OWNER_AUTH_ID = process.env.OWNER_AUTH_ID ?? null;
const LABEL = "backfill-company-settlement-orphans";

if (APPLY && !OWNER_AUTH_ID) {
  console.error(`ERROR: --apply requires OWNER_AUTH_ID env var`);
  process.exit(1);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  // Find all orphaned driver settlements
  const orphanRes = await client.query(`
    SELECT ds.id::text, ds.display_id, ds.source_document_ref,
           ds.period_start::text, ds.period_end::text, ds.trip_closed_at::text, ds.status
    FROM driver_finance.driver_settlements ds
    WHERE ds.operating_company_id = $1::uuid
      AND ds.status = 'closed'
      AND ds.settlement_model = 'load_bookended'
      AND ds.voided_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM accounting.company_settlement_driver_settlements j
         WHERE j.driver_settlement_id = ds.id
      )
    ORDER BY ds.display_id
  `, [USMCA]);

  const orphans = orphanRes.rows;
  if (orphans.length === 0) {
    console.log(`${LABEL}: 0 orphaned driver settlements found — nothing to do`);
    await client.query("ROLLBACK");
    process.exit(0);
  }

  console.log(`${LABEL}: found ${orphans.length} orphaned driver settlement(s)`);

  let created = 0;
  for (const ds of orphans) {
    const csDisplayId = ds.source_document_ref ?? ds.display_id;
    console.log(`  ${APPLY ? "APPLY" : "DRY-RUN"} ${ds.display_id} (cs display_id: ${csDisplayId})`);

    if (!APPLY) continue;

    // Find-or-create company_settlements by display_id
    const existingCS = await client.query(`
      SELECT id::text FROM accounting.company_settlements
       WHERE operating_company_id = $1::uuid AND display_id = $2 AND voided_at IS NULL
       ORDER BY created_at LIMIT 1
    `, [USMCA, csDisplayId]);

    let csId = existingCS.rows[0]?.id ?? null;
    if (!csId) {
      const insertCS = await client.query(`
        INSERT INTO accounting.company_settlements
          (operating_company_id, display_id, period_start, period_end, status, created_by_user_id)
        VALUES ($1::uuid, $2, $3::date, $4::date, 'open', $5::uuid)
        RETURNING id::text
      `, [USMCA, csDisplayId, ds.period_start, ds.period_end, OWNER_AUTH_ID]);
      csId = insertCS.rows[0].id;
      console.log(`    → created company_settlements ${csId} (${csDisplayId})`);
    } else {
      console.log(`    → found existing company_settlements ${csId} (${csDisplayId})`);
    }

    // Link the driver settlement
    await client.query(`
      INSERT INTO accounting.company_settlement_driver_settlements (company_settlement_id, driver_settlement_id)
      VALUES ($1::uuid, $2::uuid)
      ON CONFLICT DO NOTHING
    `, [csId, ds.id]);
    console.log(`    → linked ${ds.display_id} → ${csId}`);

    // Close the company settlement if all linked driver settlements are closed
    await client.query(`
      WITH linked_period AS (
        SELECT BOOL_AND(
          ds2.status IN ('closed','locked','final','paid','approved','ready')
          AND (ds2.settlement_model IS DISTINCT FROM 'load_bookended' OR ds2.trip_closed_at IS NOT NULL)
        ) AS all_closed
        FROM accounting.company_settlement_driver_settlements link
        JOIN driver_finance.driver_settlements ds2 ON ds2.id = link.driver_settlement_id
        WHERE link.company_settlement_id = $1::uuid AND ds2.operating_company_id = $2::uuid
          AND ds2.voided_at IS NULL
      )
      UPDATE accounting.company_settlements
      SET status = CASE WHEN (SELECT all_closed FROM linked_period) THEN 'closed' ELSE 'open' END,
          closed_at = CASE WHEN (SELECT all_closed FROM linked_period) THEN COALESCE(closed_at, now()) ELSE NULL END,
          closed_by_user_id = CASE WHEN (SELECT all_closed FROM linked_period) THEN COALESCE(closed_by_user_id, $3::uuid) ELSE NULL END,
          updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
    `, [csId, USMCA, OWNER_AUTH_ID]);
    console.log(`    → closed company_settlements ${csId}`);
    created++;
  }

  if (APPLY) {
    await client.query("COMMIT");
    console.log(`${LABEL}: APPLIED — created/linked ${created} company settlement(s)`);
  } else {
    await client.query("ROLLBACK");
    console.log(`${LABEL}: DRY-RUN complete — ${orphans.length} settlement(s) would be fixed. Re-run with --apply to commit.`);
  }
} finally {
  client.release();
  await pool.end();
}
