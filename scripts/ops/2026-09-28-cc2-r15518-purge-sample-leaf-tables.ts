#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r15518-purge-sample-leaf-tables.ts — ROUND 155.18, AUTH-101 part 2.
 *
 * Wholesale delete of maintenance.pm_auto_wo_log (100% sample-unit rows, confirmed live) and a
 * scoped delete of samsara.hos_snapshots (sample-driver rows only). Both are true leaf tables --
 * confirmed live via pg_constraint that nothing references either (zero inbound FKs) -- so this is
 * a plain set-based delete, no child-table sweep, no FK-closure needed. Both writer defects that
 * created these rows are already fixed at the source (PR #22967, merged) -- this is cleanup of
 * rows already written, not an ongoing leak.
 *
 * Explicitly OUT OF SCOPE (owner's own call, 2026-09-28, after seeing the FK-fanout numbers --
 * drivers referenced by 137 distinct tables, units by 90): the 58 sample master rows themselves
 * (mdata.customers/drivers/equipment/units/vendors) and their broader cascade. NOT attempted here.
 *
 * Re-verifies the 100%-sample-unit claim and the sample-driver scope INSIDE the transaction, fresh,
 * every run -- never trusts an earlier snapshot.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15518-purge-sample-leaf-tables.ts --dry-run
 *   OWNER_AUTH_ID=AUTH-101 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15518-purge-sample-leaf-tables.ts --apply
 *   OWNER_AUTH_ID=AUTH-101 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15518-purge-sample-leaf-tables.ts --apply-test-run
 */
import pg from "pg";

const AUTH_ID = "AUTH-101";
const BATCH_SIZE = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function measure(client: pg.Client) {
  const pm = await client.query<{ total: string; sample: string }>(`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE u.is_sample_data IS TRUE) AS sample
    FROM maintenance.pm_auto_wo_log l
    LEFT JOIN mdata.units u ON u.id = l.unit_id
  `);
  const hos = await client.query<{ total: string; sample: string }>(`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE d.is_sample_data IS TRUE) AS sample
    FROM samsara.hos_snapshots h
    LEFT JOIN mdata.drivers d ON d.id = h.driver_uuid
  `);
  console.log(`  maintenance.pm_auto_wo_log: total=${pm.rows[0].total} sample=${pm.rows[0].sample}`);
  console.log(`  samsara.hos_snapshots: total=${hos.rows[0].total} sample=${hos.rows[0].sample}`);
  return {
    pmTotal: Number(pm.rows[0].total),
    pmSample: Number(pm.rows[0].sample),
    hosTotal: Number(hos.rows[0].total),
    hosSample: Number(hos.rows[0].sample),
  };
}

async function bulkDeleteBatched(client: pg.Client, sql: string, ids: string[]): Promise<number> {
  let total = 0;
  for (const batch of chunk(ids, BATCH_SIZE)) {
    const t0 = Date.now();
    const res = await client.query(sql, [batch]);
    const elapsedSec = (Date.now() - t0) / 1000;
    const n = res.rowCount ?? 0;
    total += n;
    console.log(`    batch: ${n} rows in ${elapsedSec.toFixed(2)}s (${elapsedSec > 0 ? (n / elapsedSec).toFixed(1) : "inf"} rows/sec)`);
  }
  return total;
}

async function main() {
  const apply = process.argv.includes("--apply") || process.argv.includes("--apply-test-run");
  const testRun = process.argv.includes("--apply-test-run");

  if (apply && !testRun && process.env.OWNER_AUTH_ID !== AUTH_ID) {
    console.error(`REFUSED: --apply requires OWNER_AUTH_ID=${AUTH_ID} and an OPEN ${AUTH_ID} entry.`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("=== FRESH COUNTS (re-measured this run) ===");
  await measure(client);

  if (!apply) {
    console.log("\nDRY RUN ONLY -- no rows changed.");
    await client.end();
    return;
  }

  const runStart = Date.now();
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.purge_auth_id', $1, true)", [AUTH_ID]);

    // Re-verify 100% sample-unit INSIDE the transaction, fresh, before deleting anything.
    const pmCheck = await client.query<{ total: string; sample: string; non_sample: string }>(`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE u.is_sample_data IS TRUE) AS sample,
             COUNT(*) FILTER (WHERE u.is_sample_data IS NOT TRUE) AS non_sample
      FROM maintenance.pm_auto_wo_log l
      LEFT JOIN mdata.units u ON u.id = l.unit_id
    `);
    const pmNonSample = Number(pmCheck.rows[0].non_sample);
    if (pmNonSample > 0) {
      throw new Error(
        `pm_auto_wo_log is NOT 100% sample-unit inside this transaction: ${pmNonSample} non-sample row(s) found. REFUSING to delete wholesale. ROLLING BACK.`,
      );
    }
    const pmIds = await client.query<{ id: string }>(`SELECT id::text FROM maintenance.pm_auto_wo_log`);
    console.log(`\n  -- maintenance.pm_auto_wo_log: ${pmIds.rows.length} row(s), 100% sample-unit confirmed inside transaction --`);
    const pmDeleted = await bulkDeleteBatched(
      client,
      `DELETE FROM maintenance.pm_auto_wo_log WHERE id = ANY($1::uuid[])`,
      pmIds.rows.map((r) => r.id),
    );

    // Re-verify sample-driver scope INSIDE the transaction, fresh, before deleting.
    const hosIds = await client.query<{ id: string }>(`
      SELECT h.id::text FROM samsara.hos_snapshots h
      JOIN mdata.drivers d ON d.id = h.driver_uuid
      WHERE d.is_sample_data IS TRUE
    `);
    console.log(`\n  -- samsara.hos_snapshots: ${hosIds.rows.length} sample-driver-scoped row(s) confirmed inside transaction --`);
    const hosDeleted = await bulkDeleteBatched(
      client,
      `DELETE FROM samsara.hos_snapshots WHERE id = ANY($1::uuid[])`,
      hosIds.rows.map((r) => r.id),
    );

    // Post-delete sanity: pm_auto_wo_log should now be empty; hos_snapshots should have zero
    // sample-driver rows remaining.
    const after = await measure(client);
    if (after.pmTotal !== 0) {
      throw new Error(`pm_auto_wo_log NOT empty after delete: ${after.pmTotal} row(s) remain. ROLLING BACK.`);
    }
    if (after.hosSample !== 0) {
      throw new Error(`hos_snapshots still has ${after.hosSample} sample-driver row(s) after delete. ROLLING BACK.`);
    }

    const totalElapsed = (Date.now() - runStart) / 1000;
    console.log(
      `\nDeleted ${pmDeleted} pm_auto_wo_log row(s) + ${hosDeleted} hos_snapshots row(s) ` +
      `(${pmDeleted + hosDeleted} total) in ${totalElapsed.toFixed(2)}s. pm_auto_wo_log now empty. hos_snapshots has 0 sample-driver rows remaining.`,
    );

    if (testRun) {
      console.log("\n--apply-test-run: rolling back on purpose. Nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK:", (e as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
