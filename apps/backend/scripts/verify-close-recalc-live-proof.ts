#!/usr/bin/env -S npx tsx
/**
 * Live proof half of scripts/verify-close-recalculates-bills-from-real-mileage.mjs. Takes ONE real,
 * currently-open, unsettled driver_bills row, and inside a single transaction that is ALWAYS
 * ROLLBACK'd (never persisted) — perturbs the load's miles_shortest, re-runs the exact production
 * re-entry point (ensureDriverBillArtifactsForLoad — the same function update-load.service.ts's
 * DRV-BILL-SKIP-PATHS Edit Load re-entry calls), and asserts the bill's gross_amount_cents actually
 * changed to reflect the new miles. Prints PASS or FAIL on the last line; never commits.
 */
import pg from "pg";
import { ensureDriverBillArtifactsForLoad } from "../src/dispatch/book-load.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("SKIP — no DATABASE_URL");
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const target = await client.query<{
      load_id: string;
      load_number: string;
      bill_id: string;
      gross_amount_cents: number;
      miles_shortest: string | null;
    }>(
      `SELECT db.load_id::text, db.load_number, db.id::text AS bill_id, db.gross_amount_cents,
              l.miles_shortest::text
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id
        WHERE db.operating_company_id = $1::uuid
          AND db.status = 'open'
          AND db.settled_in_settlement_id IS NULL
          AND db.voided_at IS NULL
          AND db.gross_amount_cents > 0
          AND l.miles_shortest > 150
        ORDER BY db.created_at DESC
        LIMIT 1`,
      [USMCA]
    );
    const row = target.rows[0];
    if (!row) {
      console.log("SKIP — no eligible open/unsettled priced driver_bills row with miles_shortest to perturb");
      await client.query("ROLLBACK");
      return;
    }

    // Perturb DOWNWARD only — mdata.loads has a live CHECK constraint
    // (loads_miles_shortest_not_over_practical) that a naive upward perturbation can violate.
    const originalMiles = Number(row.miles_shortest);
    const perturbedMiles = originalMiles - 100;

    await client.query(`UPDATE mdata.loads SET miles_shortest = $2 WHERE id = $1::uuid`, [row.load_id, perturbedMiles]);

    const outcome = await ensureDriverBillArtifactsForLoad(client, {
      loadId: row.load_id,
      operatingCompanyId: USMCA,
      actorUserId: "e4117991-d2c0-406d-8cda-74e98d95bccd",
    });

    const after = await client.query<{ gross_amount_cents: number }>(
      `SELECT gross_amount_cents FROM driver_finance.driver_bills WHERE id = $1::uuid`,
      [row.bill_id]
    );
    const newGross = Number(after.rows[0]?.gross_amount_cents ?? -1);

    console.log(
      JSON.stringify({
        load_number: row.load_number,
        original_gross_cents: row.gross_amount_cents,
        original_miles: originalMiles,
        perturbed_miles: perturbedMiles,
        outcome,
        new_gross_cents: newGross,
      })
    );

    await client.query("ROLLBACK");

    if (outcome.outcome === "minted" && newGross !== row.gross_amount_cents && newGross < row.gross_amount_cents) {
      console.log("PASS");
    } else {
      console.log("FAIL");
      process.exitCode = 1;
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    console.log("FAIL");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
