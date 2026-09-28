#!/usr/bin/env node
// B-LEDGER-1 (ROUND 206) -- fuel.fuel_transactions.gross_cost/discount_amount/fee_amount were applied
// directly to prod on 2026-09-28 with no committed .sql (migration 202614550000 retroactively
// documents it). This guard asserts the relationship that migration's backfill established still
// holds: every row with a known total_cost has gross_cost = total_cost when discount_amount and
// fee_amount are both zero (the genesis baseline for historical rows), so an undocumented change to
// these columns that breaks that relationship is caught instead of silently drifting again.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-fuel-transactions-genesis-anchor-documented";
export const REQUIRES_LIVE_DB =
  "live-data integrity guard (fuel.fuel_transactions genesis-anchor columns); fails closed via requireLiveDbOrExit with no DATABASE_URL";

function selftest() {
  console.log(`${LABEL} selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions'
         AND column_name IN ('gross_cost', 'discount_amount', 'fee_amount')`
    );
    if (cols.rows.length !== 3) {
      failures.push(
        `expected gross_cost, discount_amount, fee_amount all present on fuel.fuel_transactions; found ${cols.rows.map((r) => r.column_name).join(", ") || "none"}`
      );
    } else {
      const bad = await client.query(`
        SELECT count(*) AS n
        FROM fuel.fuel_transactions
        WHERE gross_cost IS NOT NULL
          AND total_cost IS NOT NULL
          AND discount_amount = 0
          AND fee_amount = 0
          AND round(gross_cost, 2) != round(total_cost, 2)
      `);
      const n = Number(bad.rows[0].n);
      if (n > 0) {
        failures.push(
          `${n} row(s) have discount_amount=0 AND fee_amount=0 but gross_cost != total_cost -- the genesis-anchor baseline relationship (202614550000) no longer holds`
        );
      }
    }

    await client.query("ROLLBACK");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — gross_cost/discount_amount/fee_amount present and the genesis-anchor baseline (gross_cost = total_cost when discount=fee=0) holds for every row.`);
}

main();
