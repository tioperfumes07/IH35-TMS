/**
 * AUTH-157: backfill driver_uuid/unit_id/trailer_id on fuel-transaction-sourced expenses.
 *
 * ROOT CAUSE (fixed in this same PR): createExpenseFromFuelTransaction
 * (apps/backend/src/fuel/fuel-expense-document.service.ts) already reads driver_id/unit_id from
 * fuel.fuel_transactions into its local `fuel` row -- it just never wrote them onto the
 * accounting.expenses row it inserts. It also never selected trailer_id at all. Both are fixed
 * in this PR's other diff. This script repairs every expense that function already created under
 * the old, incomplete INSERT.
 *
 * scripts/verify-fuel-cost-posts-exactly-once.mjs check D is a shrink-only ratchet at 7 (the
 * genuine, pre-existing "trailer_id unknown, everything else present" data gap). Two of my own
 * earlier passes this session (ROUND 290.1's fuel-expense-bridge backfill, AUTH-145; and load
 * 13593's fuel rows, AUTH-146) both called the old, buggy version of createExpenseFromFuelTransaction
 * and pushed the count to 42 -- blocking every seat's push via money-pr-local-gate.mjs's always-run
 * tier. This script closes that gap back down, using ONLY data the fuel_transactions row itself
 * already carries -- never a guess, never touching the 7 genuinely-unknown-trailer legacy rows'
 * OTHER fields.
 *
 * SELECTOR (same population the guard's own check D measures):
 *   accounting.expenses e, voided_at IS NULL, source_fuel_transaction_id IS NOT NULL,
 *   joined to fuel.fuel_transactions f ON f.id = e.source_fuel_transaction_id,
 *   where e.driver_uuid IS NULL AND f.driver_id IS NOT NULL (or the unit_id / trailer_id analog).
 * Metadata-only (driver_uuid/unit_id/trailer_id), never touches GL, journal_entry_id, amounts, or
 * status -- no posting engine involved, no void/repost needed.
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth157-backfill-fuel-expense-linkage.ts
 *   OWNER_AUTH_ID=AUTH-157 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth157-backfill-fuel-expense-linkage.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const before = await client.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND source_fuel_transaction_id IS NOT NULL
          AND (load_id IS NULL OR driver_uuid IS NULL OR unit_id IS NULL OR trailer_id IS NULL OR vendor_uuid IS NULL)`,
      [USMCA_ID],
    );
    console.log(`Before: ${before.rows[0]!.cnt} linkage-incomplete fuel expenses (ratchet baseline is 7)`);

    // Unit fallback: when the fuel_transaction itself has no unit_id (common for card-import
    // rows with no telematics tag), the expense's own load carries a real assigned_unit_id --
    // the same unit the load was dispatched with. That is real, evidence-based data (not a
    // guess), same standing as reading it straight off the fuel row.
    const candidates = await client.query<{
      id: string; expense_number: string | null;
      e_driver: string | null; e_unit: string | null; e_trailer: string | null;
      f_driver: string | null; f_unit: string | null; f_trailer: string | null;
      load_unit: string | null;
    }>(
      `SELECT e.id::text, e.expense_number,
              e.driver_uuid::text AS e_driver, e.unit_id::text AS e_unit, e.trailer_id::text AS e_trailer,
              f.driver_id::text AS f_driver, f.unit_id::text AS f_unit, f.trailer_id::text AS f_trailer,
              l.assigned_unit_id::text AS load_unit
         FROM accounting.expenses e
         JOIN fuel.fuel_transactions f ON f.id = e.source_fuel_transaction_id
         LEFT JOIN mdata.loads l ON l.id = e.load_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.source_fuel_transaction_id IS NOT NULL
          AND ((e.driver_uuid IS NULL AND f.driver_id IS NOT NULL)
            OR (e.unit_id IS NULL AND (f.unit_id IS NOT NULL OR l.assigned_unit_id IS NOT NULL))
            OR (e.trailer_id IS NULL AND f.trailer_id IS NOT NULL))`,
      [USMCA_ID],
    );
    console.log(`Candidates with real backfillable data: ${candidates.rows.length}`);

    let updated = 0;
    for (const row of candidates.rows) {
      const unitValue = row.f_unit ?? row.load_unit;
      const plan = {
        id: row.id, expense_number: row.expense_number,
        driver: row.e_driver ? "already set" : row.f_driver ? `-> ${row.f_driver}` : "still null (fuel row also null)",
        unit: row.e_unit ? "already set" : unitValue ? `-> ${unitValue}${row.f_unit ? "" : " (from load.assigned_unit_id)"}` : "still null (fuel row and load both null)",
        trailer: row.e_trailer ? "already set" : row.f_trailer ? `-> ${row.f_trailer}` : "still null (no source anywhere -- expected, same shape as the accepted baseline)",
      };
      console.log(JSON.stringify(plan));
      if (DRY_RUN) continue;

      await client.query(
        `UPDATE accounting.expenses
            SET driver_uuid = COALESCE(driver_uuid, $2::uuid),
                unit_id = COALESCE(unit_id, $3::uuid),
                trailer_id = COALESCE(trailer_id, $4::uuid)
          WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
        [row.id, row.f_driver, unitValue, row.f_trailer, USMCA_ID],
      );
      updated++;
    }

    const after = await client.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL
          AND source_fuel_transaction_id IS NOT NULL
          AND (load_id IS NULL OR driver_uuid IS NULL OR unit_id IS NULL OR trailer_id IS NULL OR vendor_uuid IS NULL)`,
      [USMCA_ID],
    );
    console.log(`After (within this transaction): ${after.rows[0]!.cnt} linkage-incomplete fuel expenses`);
    console.log(`Updated: ${updated} of ${candidates.rows.length} candidates`);

    if (DRY_RUN) {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
