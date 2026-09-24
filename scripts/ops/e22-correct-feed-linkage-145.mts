#!/usr/bin/env tsx
/**
 * ROUND 145.2 — correct defective feed-writer linkage on live USMCA rows we already wrote.
 * Not a queued backfill project: stamp what the load already knows onto the documents we created.
 *
 * Batch named: feed-day-810/811/812/813 early path (created 2026-09-23 21:49–22:52Z) —
 * 10 fuel.fuel_transactions on loads 13508/13510/13511/13512/13514 with NULL driver_id AND NULL unit_id
 * (INSERT omitted / failed to bind unit+driver; trailer never written on any fuel/expense path).
 *
 * Also: stamp trailer_id from load assignment history onto all our fuel txns + expenses that lack it;
 * link fuel-origin expenses to source_fuel_transaction_id by load+amount; stamp Faro vendor on loads.
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FARO = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    // 1) Fuel: inherit driver/unit/trailer from load (assignment history for trailer)
    const fuelFix = await c.query<{ n: number }>(
      `WITH patched AS (
         UPDATE fuel.fuel_transactions ft
            SET driver_id = COALESCE(ft.driver_id, l.assigned_primary_driver_id),
                unit_id = COALESCE(ft.unit_id, l.assigned_unit_id),
                trailer_id = COALESCE(
                  ft.trailer_id,
                  (SELECT h.new_trailer_id
                     FROM dispatch.load_assignment_history h
                    WHERE h.load_id = l.id AND h.new_trailer_id IS NOT NULL
                    ORDER BY h.assigned_at DESC NULLS LAST, h.created_at DESC
                    LIMIT 1)
                ),
                updated_at = now()
           FROM mdata.loads l
          WHERE ft.operating_company_id = $1::uuid
            AND ft.load_id = l.id
            AND (
              ft.driver_id IS NULL
              OR ft.unit_id IS NULL
              OR ft.trailer_id IS NULL
            )
          RETURNING ft.id
       )
       SELECT count(*)::int AS n FROM patched`,
      [USMCA]
    );
    console.log(`FUEL_INHERIT_FROM_LOAD rows=${fuelFix.rows[0]?.n ?? 0}`);

    // 2) Expenses: inherit driver/unit/trailer from load
    const expFix = await c.query<{ n: number }>(
      `WITH patched AS (
         UPDATE accounting.expenses e
            SET driver_uuid = COALESCE(e.driver_uuid, l.assigned_primary_driver_id),
                unit_id = COALESCE(e.unit_id, l.assigned_unit_id),
                trailer_id = COALESCE(
                  e.trailer_id,
                  (SELECT h.new_trailer_id
                     FROM dispatch.load_assignment_history h
                    WHERE h.load_id = l.id AND h.new_trailer_id IS NOT NULL
                    ORDER BY h.assigned_at DESC NULLS LAST, h.created_at DESC
                    LIMIT 1)
                )
           FROM mdata.loads l
          WHERE e.operating_company_id = $1::uuid
            AND e.voided_at IS NULL
            AND e.load_id = l.id
            AND (
              e.driver_uuid IS NULL
              OR e.unit_id IS NULL
              OR e.trailer_id IS NULL
            )
          RETURNING e.id
       )
       SELECT count(*)::int AS n FROM patched`,
      [USMCA]
    );
    console.log(`EXPENSE_INHERIT_FROM_LOAD rows=${expFix.rows[0]?.n ?? 0}`);

    // 3) Link fuel-origin expenses to their fuel txn (same load, same cents, nearest date)
    const linkFix = await c.query<{ n: number }>(
      `WITH candidates AS (
         SELECT e.id AS expense_id, ft.id AS fuel_id,
                row_number() OVER (
                  PARTITION BY e.id
                  ORDER BY abs((ft.transaction_at::date - e.transaction_date))
                ) AS rn
           FROM accounting.expenses e
           JOIN fuel.fuel_transactions ft
             ON ft.operating_company_id = e.operating_company_id
            AND ft.load_id = e.load_id
            AND round(ft.total_cost::numeric * 100)::int = e.total_amount_cents
          WHERE e.operating_company_id = $1::uuid
            AND e.voided_at IS NULL
            AND e.source_fuel_transaction_id IS NULL
            AND e.load_id IS NOT NULL
            AND e.memo ILIKE 'Fuel ·%'
       ),
       patched AS (
         UPDATE accounting.expenses e
            SET source_fuel_transaction_id = c.fuel_id
           FROM candidates c
          WHERE e.id = c.expense_id AND c.rn = 1
          RETURNING e.id
       )
       SELECT count(*)::int AS n FROM patched`,
      [USMCA]
    );
    console.log(`EXPENSE_SOURCE_FUEL_LINK rows=${linkFix.rows[0]?.n ?? 0}`);

    // 4) Faro vendor on every USMCA load we fed
    const loadFix = await c.query<{ n: number }>(
      `WITH patched AS (
         UPDATE mdata.loads l
            SET factoring_company_vendor_id = $2::uuid,
                updated_at = now()
          WHERE l.operating_company_id = $1::uuid
            AND l.soft_deleted_at IS NULL
            AND l.factoring_company_vendor_id IS NULL
            AND EXISTS (
              SELECT 1 FROM accounting.invoices inv
               WHERE inv.source_load_id = l.id
                 AND inv.operating_company_id = $1::uuid
                 AND inv.factoring_advance_id IS NOT NULL
            )
          RETURNING l.id
       )
       SELECT count(*)::int AS n FROM patched`,
      [USMCA, FARO]
    );
    console.log(`LOAD_FARO_VENDOR_STAMP rows=${loadFix.rows[0]?.n ?? 0}`);

    // Remeasure
    const m = await c.query(
      `SELECT
         (SELECT count(*) FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid)::int AS fuel_n,
         (SELECT count(*) FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND driver_id IS NULL)::int AS fuel_no_driver,
         (SELECT count(*) FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND unit_id IS NULL)::int AS fuel_no_unit,
         (SELECT count(*) FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND trailer_id IS NULL)::int AS fuel_no_trailer,
         (SELECT count(*) FROM accounting.expenses WHERE operating_company_id=$1::uuid AND voided_at IS NULL)::int AS exp_n,
         (SELECT count(*) FROM accounting.expenses WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND driver_uuid IS NULL)::int AS exp_no_driver,
         (SELECT count(*) FROM accounting.expenses WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND trailer_id IS NULL)::int AS exp_no_trailer,
         (SELECT count(*) FROM accounting.expenses WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND source_fuel_transaction_id IS NULL AND memo ILIKE 'Fuel ·%')::int AS exp_fuel_unlinked,
         (SELECT count(*) FROM mdata.loads WHERE operating_company_id=$1::uuid AND soft_deleted_at IS NULL AND factoring_company_vendor_id IS NULL)::int AS loads_no_faro,
         (SELECT count(*) FROM mdata.loads WHERE operating_company_id=$1::uuid AND soft_deleted_at IS NULL)::int AS loads_n`,
      [USMCA]
    );
    console.log("REMEASURE", m.rows[0]);

    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
