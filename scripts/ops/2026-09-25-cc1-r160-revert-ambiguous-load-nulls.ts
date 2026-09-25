/**
 * R-160 correction — AUTH-018's relink step set load_id=NULL on accounting.expenses,
 * driver_finance.settlement_lines and driver_finance.driver_bills rows for the 10 (of 13)
 * Transportation loads whose settlement had 0 or 2+ other USMCA loads ("list, don't guess").
 * verify-alwaystrack-parity's own live measurement caught the real consequence, before this went
 * further: every load_id-keyed query in the codebase (this guard's billByLoad/expenseByLoad
 * included) JOINs `... ON db.load_id = l.id` -- setting load_id NULL makes these rows invisible to
 * ANY load-scoped lookup, which silently zeroed 8 documents' driver_payment/expenses figures even
 * though the owner's own order says those "stay whole per document."
 *
 * The load record itself was only SOFT-DELETED (void, never delete) -- it still exists, so leaving
 * load_id pointing at it is not a dangling reference, and Lead's own R-160 order never actually said
 * to null it for the ambiguous cases ("list any settlement with none" -- list/report, not null).
 * Reverting to the ORIGINAL Transportation load_id is the correct, minimal fix for these 10 loads;
 * the 3 real relinks (13497->13511, 13530->13532, 13533->13548) are untouched -- they are not part
 * of this correction.
 *
 * Source of truth: audit.row_changes, which recorded the exact old_load_id for every row AUTH-018
 * touched (queried live before writing this -- not guessed, not reconstructed from settlement
 * membership). Reverts exactly the rows whose audit trail shows new_load_id NULL and
 * old_load_id one of the 10 named Transportation load ids, changed by AUTH-018's own run.
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
// The 10 (of 13) Transportation load ids whose settlement had 0 or 2+ other USMCA loads -- these
// are the ONLY loads eligible for a revert; the 3 real relinks (13497/13530/13533) are excluded.
const AMBIGUOUS_LOAD_IDS = [
  "1968693e-1d9b-48c3-b5e7-8d914df426bc", // 13539
  "2c2d9ae7-386d-4ede-9c8f-888bce2896d7", // 13503
  "418a3c89-02c6-4732-9860-4eba6e24bbdc", // 13506
  "4d8935e5-87c9-4a04-9044-539d7898c235", // 13531
  "6cfa9455-9979-4719-b614-7a7b02b66843", // 13502
  "7ace8319-6b54-4c78-aa9c-621e0df1f648", // 13522
  "951e3250-b958-4f1c-9ee1-bcb0f866442e", // 13504
  "ab24126b-9365-4cec-bb10-3dffc535cdfd", // 13507
  "c516a904-fdb7-4a85-8626-ef1fba5c0151", // 13509
  "c680f31a-ab3f-437e-a6ac-be2ed91b1791", // 13505
];
const CHANGE_WINDOW_START = "2026-09-25T16:20:00Z"; // AUTH-018's production run window, real UTC bound.

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const dryRun = process.env.DRY_RUN === "1";
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const auditRes = await client.query<{ table_name: string; row_pk: string; old_load_id: string }>(
      `SELECT table_name, row_pk, old_data->>'load_id' AS old_load_id
         FROM audit.row_changes
        WHERE table_name IN ('expenses', 'settlement_lines', 'driver_bills')
          AND changed_at > $1::timestamptz
          AND new_data->>'load_id' IS NULL
          AND old_data->>'load_id' = ANY($2::text[])`,
      [CHANGE_WINDOW_START, AMBIGUOUS_LOAD_IDS]
    );
    const byTable = new Map<string, Array<{ row_pk: string; old_load_id: string }>>();
    for (const r of auditRes.rows) {
      const list = byTable.get(r.table_name) ?? [];
      list.push({ row_pk: r.row_pk, old_load_id: r.old_load_id });
      byTable.set(r.table_name, list);
    }
    const expenseRows = byTable.get("expenses") ?? [];
    const settlementLineRows = byTable.get("settlement_lines") ?? [];
    const driverBillRows = byTable.get("driver_bills") ?? [];
    console.log(`Resolved from audit.row_changes: ${expenseRows.length} expenses, ${settlementLineRows.length} settlement_lines, ${driverBillRows.length} driver_bills.`);

    if (dryRun) {
      console.log("DRY_RUN=1 -- resolution only, rolling back.");
      await client.query("ROLLBACK");
      return;
    }

    let expReverted = 0;
    for (const row of expenseRows) {
      const res = await client.query(
        `UPDATE accounting.expenses SET load_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND load_id IS NULL
        RETURNING id`,
        [row.row_pk, row.old_load_id, USMCA_ID]
      );
      expReverted += res.rowCount ?? 0;
    }

    let slReverted = 0;
    for (const row of settlementLineRows) {
      const res = await client.query(
        `UPDATE driver_finance.settlement_lines SET load_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND load_id IS NULL`,
        [row.row_pk, row.old_load_id, USMCA_ID]
      );
      slReverted += res.rowCount ?? 0;
    }

    let dbReverted = 0;
    for (const row of driverBillRows) {
      const res = await client.query(
        `UPDATE driver_finance.driver_bills SET load_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND load_id IS NULL`,
        [row.row_pk, row.old_load_id, USMCA_ID]
      );
      dbReverted += res.rowCount ?? 0;
    }

    await client.query("COMMIT");
    console.log(`COMMITTED. Reverted ${expReverted} expenses, ${slReverted} settlement_lines, ${dbReverted} driver_bills back to their original (now soft-deleted) Transportation load_id.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
