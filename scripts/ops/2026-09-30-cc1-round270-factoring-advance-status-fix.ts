#!/usr/bin/env npx tsx
/**
 * ROUND 270 — correct the 2 USMCA accounting.factoring_advances rows whose status was left
 * 'advanced' after voided_at was stamped (root cause: no factoring_advance case in
 * executeVoidCancel, so whatever voided these used a raw UPDATE that never touched status).
 * See AUTH-132 in docs/bus/OWNER-AUTHORIZATIONS.md for full scope.
 *
 * Usage: OWNER_AUTH_ID=AUTH-132 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-round270-factoring-advance-status-fix.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROWS = ["1f09c82c-81f2-4908-b1a4-577461be4ade", "9667e71c-9f29-44ff-af31-f28ffb43282b"];

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-132") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-132");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    for (const id of ROWS) {
      const pre = await client.query(
        `SELECT id, status, voided_at, faro_invoice_number FROM accounting.factoring_advances
         WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [id, USMCA]
      );
      const row = pre.rows[0];
      if (!row) throw new Error(`row ${id} not found`);
      if (row.status !== "advanced" || !row.voided_at) {
        throw new Error(`row ${id} not in expected pre-state: ${JSON.stringify(row)}`);
      }

      const res = await client.query(
        `UPDATE accounting.factoring_advances
            SET status = 'voided', status_before_void = 'advanced'
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
            AND status = 'advanced' AND voided_at IS NOT NULL
          RETURNING id, status, voided_at`,
        [id, USMCA]
      );
      if (res.rowCount !== 1) throw new Error(`update did not affect exactly 1 row for ${id}: rowCount=${res.rowCount}`);
      console.log(`${id} (${row.faro_invoice_number}) -> status='voided'`);
    }

    await client.query("COMMIT");
    console.log("done");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
