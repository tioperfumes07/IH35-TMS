/**
 * R-153.8 Decision 2 (Lead, 2026-09-25 6:22 AM CT/11:22Z) — fills accounting.expenses.unit_id /
 * driver_uuid / trailer_id from the SAME expense's own already-linked USMCA load's dispatch
 * assignment, single-valued only, never overwriting a non-null field. "This is linkage, not
 * backfill" -- LAW.md's "no USMCA backfill" law is about never importing IH35 Transportation's
 * (a different, frozen entity) historical data into USMCA; this touches only a USMCA expense's own
 * link to its own already-USMCA load. Ruling supersedes ROUND 153 item 11's earlier DECISION NEEDED
 * (PR #22592) -- that pass was read-only measurement precisely because this question was open; it
 * is now answered.
 *
 * SOURCE PER FIELD -- reusing the codebase's own EXISTING resolution logic, not a new engine:
 *   unit_id     -> mdata.loads.assigned_unit_id. Exactly the Rung-2 resolution
 *                  apps/backend/src/accounting/expenses.routes.ts's own PATCH handler already
 *                  performs live for every new expense ("trace to the leg; the leg carries the
 *                  truck", GO-19-1b). A single scalar field -- always single-valued when non-null.
 *   driver_uuid -> mdata.loads.assigned_primary_driver_id, ONLY when assigned_secondary_driver_id
 *                  IS NULL. A team load (2 drivers) is genuinely two-valued -- skipped, listed,
 *                  never guessed which driver, per the Lead's own "two drivers... leave it" rule.
 *   trailer_id  -> the load's CURRENT trailer per dispatch.load_assignment_history (most recent
 *                  new_trailer_id), the exact pattern reconciler invariant I8 already uses live
 *                  (apps/backend/src/reconciler/invariants/i8-dispatched-load-complete.ts) --
 *                  mdata.loads.load_trailer_equipment_id is the equipment TYPE, not a trailer, and
 *                  is never used for this. Deterministic ORDER BY (assigned_at, created_at, id) ->
 *                  always exactly one row when any assignment history exists for that load.
 *
 * NEVER OVERWRITE: every write uses COALESCE(existing, resolved) -- a field that already carries a
 * value is returned unchanged by definition, never touched, regardless of what the load resolves to.
 *
 * CONCURRENCY NOTE: docs/bus/NOW-CC-2.md's AUTH-005 (fuel remediation, running concurrently) also
 * writes accounting.expenses rows (createExpenseFromFuelTransaction, new fuel-category expenses).
 * This script's population is measured fresh immediately before the write (LAW 3 -- never cite a
 * stale count) and grew significantly since item 11's 07:22Z/11:22Z measurement (373 -> see live
 * count below) as a direct, expected result of that concurrent work. This script only ever fills a
 * NULL linkage field via COALESCE -- it never touches the GL account, category, or dollar amount of
 * any expense (fuel-content included), so it does not "touch fuel" in the R-153.6 sense (that rule
 * is about fuel dollar/GL treatment, not dispatch-linkage metadata); Postgres's own row-level
 * locking makes concurrent UPDATEs from two scripts against overlapping rows safe by construction.
 *
 * Idempotent: COALESCE means a NULL-already-filled field is a true no-op on re-run; the reported
 * "skipped" list only ever contains rows with no resolvable source (load itself has no
 * assignment, or a genuinely ambiguous team-driver load) -- never re-attempted, never silently
 * dropped.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    const before = await client.query<{ total: string; no_unit: string; no_driver: string; no_trailer: string }>(
      `SELECT count(*)::int AS total,
         count(*) FILTER (WHERE unit_id IS NULL)::int AS no_unit,
         count(*) FILTER (WHERE driver_uuid IS NULL)::int AS no_driver,
         count(*) FILTER (WHERE trailer_id IS NULL)::int AS no_trailer
         FROM accounting.expenses WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
      [USMCA_ID]
    );
    console.log("BEFORE (live, measured now):", JSON.stringify(before.rows[0]));

    // unit_id: single scalar field on the load, always single-valued when non-null.
    const unitRes = await client.query(
      `UPDATE accounting.expenses e
          SET unit_id = l.assigned_unit_id
         FROM mdata.loads l
        WHERE l.id = e.load_id AND l.operating_company_id = e.operating_company_id
          AND e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.unit_id IS NULL AND l.assigned_unit_id IS NOT NULL
        RETURNING e.id`,
      [USMCA_ID]
    );
    console.log(`unit_id filled: ${unitRes.rowCount}`);

    // driver_uuid: only when the load has exactly one driver (no secondary/team driver).
    const driverRes = await client.query(
      `UPDATE accounting.expenses e
          SET driver_uuid = l.assigned_primary_driver_id
         FROM mdata.loads l
        WHERE l.id = e.load_id AND l.operating_company_id = e.operating_company_id
          AND e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.driver_uuid IS NULL AND l.assigned_primary_driver_id IS NOT NULL
          AND l.assigned_secondary_driver_id IS NULL
        RETURNING e.id`,
      [USMCA_ID]
    );
    console.log(`driver_uuid filled: ${driverRes.rowCount}`);

    // trailer_id: the load's current trailer per its own assignment history (I8's own pattern).
    // (UPDATE ... FROM cannot LATERAL-reference the target table itself, so resolve via a
    // subquery keyed on expense id instead.)
    const trailerRes = await client.query(
      `UPDATE accounting.expenses e
          SET trailer_id = sub.new_trailer_id
         FROM (
           SELECT e2.id, tr.new_trailer_id
             FROM accounting.expenses e2
             CROSS JOIN LATERAL (
               SELECT lah.new_trailer_id FROM dispatch.load_assignment_history lah
                WHERE lah.load_id = e2.load_id AND lah.operating_company_id = e2.operating_company_id
                  AND lah.new_trailer_id IS NOT NULL
                ORDER BY lah.assigned_at DESC, lah.created_at DESC, lah.id DESC LIMIT 1
             ) tr
            WHERE e2.operating_company_id = $1::uuid AND e2.voided_at IS NULL
              AND e2.trailer_id IS NULL AND e2.load_id IS NOT NULL
         ) sub
        WHERE e.id = sub.id
        RETURNING e.id`,
      [USMCA_ID]
    );
    console.log(`trailer_id filled: ${trailerRes.rowCount}`);

    const skipped = await client.query<{ expense_number: string; missing: string[]; reason: string }>(
      `SELECT e.expense_number,
         array_remove(ARRAY[
           CASE WHEN e.unit_id IS NULL THEN 'unit' END,
           CASE WHEN e.driver_uuid IS NULL THEN 'driver' END,
           CASE WHEN e.trailer_id IS NULL THEN 'trailer' END
         ], NULL) AS missing,
         CASE
           WHEN e.driver_uuid IS NULL AND l.assigned_secondary_driver_id IS NOT NULL THEN 'team load, 2 drivers -- ambiguous'
           WHEN e.unit_id IS NULL AND l.assigned_unit_id IS NULL AND e.driver_uuid IS NULL AND l.assigned_primary_driver_id IS NULL THEN 'load has no unit or driver assigned'
           WHEN e.unit_id IS NULL AND l.assigned_unit_id IS NULL THEN 'load has no unit assigned'
           WHEN e.driver_uuid IS NULL AND l.assigned_primary_driver_id IS NULL THEN 'load has no driver assigned'
           WHEN e.trailer_id IS NULL THEN 'load has no trailer in assignment history'
           ELSE 'unresolved'
         END AS reason
       FROM accounting.expenses e
       LEFT JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
       WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
         AND (e.unit_id IS NULL OR e.driver_uuid IS NULL OR e.trailer_id IS NULL)
       ORDER BY e.expense_number`,
      [USMCA_ID]
    );

    const after = await client.query<{ total: string; no_unit: string; no_driver: string; no_trailer: string }>(
      `SELECT count(*)::int AS total,
         count(*) FILTER (WHERE unit_id IS NULL)::int AS no_unit,
         count(*) FILTER (WHERE driver_uuid IS NULL)::int AS no_driver,
         count(*) FILTER (WHERE trailer_id IS NULL)::int AS no_trailer
         FROM accounting.expenses WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
      [USMCA_ID]
    );
    console.log("AFTER:", JSON.stringify(after.rows[0]));
    console.log(`ROWS LEFT (${skipped.rows.length}):`);
    for (const row of skipped.rows) {
      console.log(`  ${row.expense_number}: missing=[${row.missing.join(",")}] reason="${row.reason}"`);
    }

    if (process.env.DRY_RUN === "1") {
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
