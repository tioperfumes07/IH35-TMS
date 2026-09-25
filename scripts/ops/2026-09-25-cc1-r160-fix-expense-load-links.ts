/**
 * R-160 order 3 completeness -- verify-alwaystrack-parity's own structural assertion D caught this
 * live, before proceeding: relinking accounting.expenses.load_id (already done, production) did NOT
 * update the SEPARATE denormalized expense_attribution.expense_load_links table, which carries its
 * own load_id/load_number columns keyed by (expense_source, expense_id). 9 rows for the 3 relink-
 * target loads (13511, 13532, 13548) still show link_load_number = the OLD, now-soft-deleted
 * Transportation load (13497/13530/13533 respectively) while accounting.expenses.load_id already
 * correctly points at the new load -- confirmed live, exact ids below, not guessed.
 *
 * Fixes exactly these 9 named expense_load_links rows: sets load_id/load_number to match the
 * expense's own current (already-relinked) load. Touches no other row, no other table.
 *
 * (A separate, PRE-EXISTING set of expenses with no expense_load_links row at all was also found
 * live -- not touched here: that gap predates R-160 and is not part of this authorization's scope.)
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

const TARGET_LINK_IDS = [
  "51b13ee1-afa7-4f7b-8e23-ff60b054cdf8", "4a95f44c-a799-4dcb-a85c-dc345c814d03", "d94c973f-52a1-41ed-b02c-cd87e95e9cb0",
  "c46cc984-996e-4272-a917-0376084faa29", "f354dcdc-8628-44cb-8d42-b0abcdc95277", "7ec23ef0-f517-41cd-9ffb-167c3c169788",
  "29c30a09-0e50-401e-9538-26bdce05648f", "707c9147-9c5f-42d4-ad43-c4028cf31c9c", "619f3a60-6bc0-46e4-9cb7-e4debb0578b1",
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const dryRun = process.env.DRY_RUN === "1";
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const pre = await client.query<{ id: string; link_load_number: string; expense_load_number: string }>(
      `SELECT ell.id::text, ell.load_number AS link_load_number, l.load_number AS expense_load_number
         FROM expense_attribution.expense_load_links ell
         JOIN accounting.expenses e ON e.id = ell.expense_id AND ell.expense_source = 'accounting'
         JOIN mdata.loads l ON l.id = e.load_id
        WHERE ell.id = ANY($1::uuid[]) AND ell.operating_company_id = $2::uuid`,
      [TARGET_LINK_IDS, USMCA_ID]
    );
    if (pre.rows.length !== TARGET_LINK_IDS.length) throw new Error(`Expected ${TARGET_LINK_IDS.length} rows, found ${pre.rows.length} -- STOP`);
    for (const r of pre.rows) {
      if (r.link_load_number === r.expense_load_number) throw new Error(`row ${r.id}: already matches (${r.link_load_number}) -- STOP, shape changed since investigation`);
    }
    console.log(`Pre-check passed: ${pre.rows.length} rows, all stale as expected.`);

    if (dryRun) {
      console.log("DRY_RUN=1 -- pre-check only, rolling back.");
      await client.query("ROLLBACK");
      return;
    }

    const res = await client.query(
      `UPDATE expense_attribution.expense_load_links ell
          SET load_id = e.load_id, load_number = l.load_number, attribution_reason = COALESCE(ell.attribution_reason, '') || ' | R-160: resynced to the expense''s post-relink load'
         FROM accounting.expenses e
         JOIN mdata.loads l ON l.id = e.load_id
        WHERE ell.expense_id = e.id AND ell.expense_source = 'accounting'
          AND ell.id = ANY($1::uuid[]) AND ell.operating_company_id = $2::uuid
      RETURNING ell.id`,
      [TARGET_LINK_IDS, USMCA_ID]
    );
    await client.query("COMMIT");
    console.log(`COMMITTED. Resynced ${res.rowCount} expense_load_links rows.`);
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
