#!/usr/bin/env node
/**
 * Backfill live_load_number on Cascade REV-E loads (L-20260830-0008..0019).
 * Maps by customer+revenue from CC-2-AUG-LOADS-BY-FACTOR.csv USMCA rows.
 *
 * Usage: DATABASE_URL=... node scripts/ops/backfill-rev-e-live-load-number.mjs [--dry-run]
 */
import pg from "pg";

const USMCA_AT_BY_REVENUE_CUSTOMER = [
  { at: "13511", revenue: 3600, customerLike: "rehmann" },
  { at: "13510", revenue: 3000, customerLike: "impact bulk" },
  { at: "13508", revenue: 2500, customerLike: "ncc" },
  { at: "13514", revenue: 2700, customerLike: "magna" },
  { at: "13520", revenue: 2600, customerLike: "bv logistics" },
  { at: "13513", revenue: 525, customerLike: "fls transportation" },
  { at: "13516", revenue: 700, customerLike: "sethmar" },
  { at: "13518", revenue: 4000, customerLike: "cts" },
  { at: "13519", revenue: 4900, customerLike: "semares" },
  // Unfactored / non-invoice cohort — still backfill AT# for reconciliation
  { at: "13509", revenue: 4400, customerLike: "es logistics" },
  { at: "13515", revenue: 525, customerLike: "fls transportation" },
  { at: "13517", revenue: 3800, customerLike: "refrigerx" },
];

const dryRun = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

  const { rows: loads } = await client.query(
    `SELECT l.id, l.display_id, l.live_load_number, l.revenue_cents / 100.0 AS revenue_usd,
            c.name AS customer_name
     FROM mdata.loads l
     LEFT JOIN mdata.customers c ON c.id = l.customer_id
     WHERE l.display_id LIKE 'L-20260830-%'
       AND l.voided_at IS NULL
     ORDER BY l.display_id`
  );

  if (loads.length === 0) {
    console.log("No L-20260830-* loads found");
    await client.query("ROLLBACK");
    process.exit(0);
  }

  let updated = 0;
  for (const load of loads) {
    if (load.live_load_number) {
      console.log(`SKIP ${load.display_id} already has live_load_number=${load.live_load_number}`);
      continue;
    }
    const rev = Number(load.revenue_usd);
    const name = String(load.customer_name ?? "").toLowerCase();
    const match = USMCA_AT_BY_REVENUE_CUSTOMER.find(
      (m) => Math.abs(m.revenue - rev) < 0.01 && name.includes(m.customerLike)
    );
    if (!match) {
      console.warn(`NO MATCH ${load.display_id} rev=${rev} customer=${load.customer_name}`);
      continue;
    }
    console.log(`${dryRun ? "DRY" : "PATCH"} ${load.display_id} -> live_load_number=${match.at}`);
    if (!dryRun) {
      await client.query(
        `UPDATE mdata.loads SET live_load_number = $1, updated_at = now() WHERE id = $2`,
        [match.at, load.id]
      );
    }
    updated += 1;
  }

  if (dryRun) {
    await client.query("ROLLBACK");
    console.log(`Dry run: would update ${updated} rows`);
  } else {
    await client.query("COMMIT");
    console.log(`Updated ${updated} rows`);
  }
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
