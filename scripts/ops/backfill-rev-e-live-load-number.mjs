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
    `SELECT l.id, l.load_number, l.live_load_number, l.rate_total_cents / 100.0 AS revenue_usd,
            c.customer_name AS customer_name
     FROM mdata.loads l
     LEFT JOIN mdata.customers c ON c.id = l.customer_id
     WHERE l.load_number LIKE 'L-20260830-%'
       AND l.soft_deleted_at IS NULL
     ORDER BY l.load_number`
  );

  if (loads.length === 0) {
    console.log("No L-20260830-* loads found");
    await client.query("ROLLBACK");
    process.exit(0);
  }

  let updated = 0;
  const claimedAt = new Map(); // at# -> load_number already assigned this run, to catch double-assignment
  for (const load of loads) {
    // A real AT# was already backfilled correctly if live_load_number is set to
    // something OTHER than the load's own internal load_number. Some REV-E loads
    // were booked via the historical-import path with live_load_number typed in
    // as a same-value placeholder (live_load_number === load_number) instead of
    // the real AlwaysTrack number -- treat that as still needing the real match,
    // not as already-correct.
    if (load.live_load_number && load.live_load_number !== load.load_number) {
      console.log(`SKIP ${load.load_number} already has real live_load_number=${load.live_load_number}`);
      continue;
    }
    const rev = Number(load.revenue_usd);
    const name = String(load.customer_name ?? "").toLowerCase();
    const matches = USMCA_AT_BY_REVENUE_CUSTOMER.filter(
      (m) => Math.abs(m.revenue - rev) < 0.01 && name.includes(m.customerLike)
    );
    if (matches.length === 0) {
      console.warn(`NO MATCH ${load.load_number} rev=${rev} customer=${load.customer_name}`);
      continue;
    }
    if (matches.length > 1) {
      console.error(
        `AMBIGUOUS ${load.load_number} rev=${rev} customer=${load.customer_name} -- ` +
          `${matches.length} candidate AT#s (${matches.map((m) => m.at).join(", ")}); refusing to guess, skipping`
      );
      continue;
    }
    const match = matches[0];
    if (claimedAt.has(match.at)) {
      console.error(
        `DUPLICATE-CLAIM ${load.load_number} would take AT#${match.at}, already assigned to ` +
          `${claimedAt.get(match.at)} this run (same revenue+customer collision) -- refusing to guess, skipping`
      );
      continue;
    }
    claimedAt.set(match.at, load.load_number);
    console.log(`${dryRun ? "DRY" : "PATCH"} ${load.load_number} -> live_load_number=${match.at}`);
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
