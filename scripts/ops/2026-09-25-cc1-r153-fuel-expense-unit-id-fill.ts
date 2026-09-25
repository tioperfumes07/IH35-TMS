/**
 * Lead task (2026-09-25 9:01 AM CT/14:01Z, "after Set B"): fill unit_id on fuel expenses missing
 * it from feed_input.json's own record.truck field, mapped to mdata.units.unit_number.
 *
 * SOURCE: ~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json -- 124 records, each
 * keyed by load_number, carrying its own settlement-document-derived .truck code (e.g. "T175").
 * Read directly, never re-typed by hand.
 *
 * TARGET POPULATION: accounting.expenses rows (USMCA, not voided) with unit_id IS NULL,
 * source_fuel_transaction_id IS NOT NULL (the AUTH-005-created fuel expenses -- the exact
 * population R-153.9's "fuel off the books" report is about), and load_id IS NOT NULL (required
 * to resolve the load_number this join needs). Live count at authoring time: 118 -- NOT Lead's
 * cited "141"; broader fuel-content criteria (line_category IN fuel/def/reefer, or memo ILIKE
 * fuel/diesel) were checked and also do not land on exactly 141, and the true population has been
 * moving all night (concurrent AUTH-005 fuel work). Re-measured live immediately before writing,
 * per LAW 3 -- the real count is reported honestly, not forced to match a cited figure.
 *
 * MATCH: expense.load_id -> mdata.loads.load_number -> feed_input.json record with that
 * load_number -> record.truck -> mdata.units.unit_number -> unit_id. A load_number with NO
 * feed_input.json record, or a truck code with no live mdata.units row, is reported and skipped
 * -- never guessed.
 *
 * NEVER OVERWRITE: the UPDATE only ever targets rows already confirmed unit_id IS NULL in the
 * WHERE clause -- a row with an existing unit_id is never touched, matching the exact
 * "never overwrite a non-null field" rule Lead used for D2 (item 11).
 *
 * Idempotent: re-running skips every row already filled (WHERE unit_id IS NULL still true).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
const FEED_INPUT_PATH = path.join(os.homedir(), "Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json");

type FeedRecord = { load_number: string; truck: string | null };

async function main() {
  const feed = JSON.parse(fs.readFileSync(FEED_INPUT_PATH, "utf8")) as { records: FeedRecord[] };
  const truckByLoadNumber = new Map<string, string>();
  for (const r of feed.records) {
    if (r.load_number && r.truck) truckByLoadNumber.set(r.load_number, r.truck);
  }
  console.log(`feed_input.json: ${feed.records.length} records, ${truckByLoadNumber.size} with a truck code.`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    const before = await client.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND unit_id IS NULL
          AND source_fuel_transaction_id IS NOT NULL AND load_id IS NOT NULL`,
      [USMCA_ID]
    );
    console.log(`BEFORE (live, measured now): ${before.rows[0]?.n} fuel expenses missing unit_id (with load_id).`);

    const targets = await client.query<{ id: string; expense_number: string; load_number: string }>(
      `SELECT e.id::text, e.expense_number, l.load_number
         FROM accounting.expenses e
         JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.unit_id IS NULL
          AND e.source_fuel_transaction_id IS NOT NULL AND e.load_id IS NOT NULL
        ORDER BY e.expense_number`,
      [USMCA_ID]
    );

    let filled = 0;
    const noFeedRecord: string[] = [];
    const noUnitMatch: string[] = [];

    for (const row of targets.rows) {
      const truck = truckByLoadNumber.get(row.load_number);
      if (!truck) {
        noFeedRecord.push(`${row.expense_number} (load ${row.load_number})`);
        continue;
      }
      const unitRes = await client.query<{ id: string }>(
        `SELECT id::text FROM mdata.units WHERE unit_number = $1 LIMIT 1`,
        [truck]
      );
      const unitId = unitRes.rows[0]?.id;
      if (!unitId) {
        noUnitMatch.push(`${row.expense_number} (load ${row.load_number}, truck ${truck})`);
        continue;
      }
      const upd = await client.query(
        `UPDATE accounting.expenses SET unit_id = $2::uuid
           WHERE id = $1::uuid AND operating_company_id = $3::uuid AND unit_id IS NULL`,
        [row.id, unitId, USMCA_ID]
      );
      if ((upd.rowCount ?? 0) > 0) filled += 1;
    }

    console.log(`FILLED: ${filled}`);
    console.log(`NO FEED RECORD FOR LOAD (${noFeedRecord.length}):`);
    for (const x of noFeedRecord) console.log(`  ${x}`);
    console.log(`NO mdata.units MATCH FOR TRUCK CODE (${noUnitMatch.length}):`);
    for (const x of noUnitMatch) console.log(`  ${x}`);

    const after = await client.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND unit_id IS NULL
          AND source_fuel_transaction_id IS NOT NULL AND load_id IS NOT NULL`,
      [USMCA_ID]
    );
    console.log(`AFTER: ${after.rows[0]?.n} fuel expenses still missing unit_id.`);

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
