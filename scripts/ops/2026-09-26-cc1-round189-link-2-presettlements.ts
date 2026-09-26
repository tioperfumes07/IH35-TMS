#!/usr/bin/env tsx
/**
 * ROUND 189 step 4 follow-up: bookLoad() for 13609 (Ruben Pedro Perez Garcia) and 13617 (Neftali
 * Coronado Urbano) hit uq_driver_settlements_one_open_per_driver on their FIRST attempt (both drivers
 * already have an open pre-settlement -- P-0004 and P-0002 respectively, from AUTH-038's earlier fix)
 * and were retried with trip_type/tour_id omitted, per the same known-blocker workaround the reference
 * script (round27-1-step1-loads-and-rate-corrections.ts) uses. That workaround correctly avoids the
 * collision but leaves presettlement_link_id NULL on those 2 loads -- "real settlement placement is
 * [a follow-up] job", same as that reference script's own comment. This script does that follow-up:
 * links each of the 2 loads to its driver's own already-open pre-settlement via the canonical
 * reassignLoadToSettlementInClientTx (never a raw UPDATE of presettlement_link_id).
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 189: OWNER_AUTH_ID env var is required.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 189: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGETS = [
  { load_number: "13609", driver_id: "1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9", settlement_display: "P-0004" },
  { load_number: "13617", driver_id: "a32a35c8-7cd5-4368-83f0-35e185092433", settlement_display: "P-0002" },
];

async function main() {
  const { reassignLoadToSettlementInClientTx } = await import(
    "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js"
  );
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const t of TARGETS) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

        const loadRow = await client.query<{ id: string; presettlement_link_id: string | null }>(
          `SELECT id::text, presettlement_link_id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`,
          [USMCA_ID, t.load_number]
        );
        if (!loadRow.rows[0]) throw new Error(`${t.load_number}: not found`);
        if (loadRow.rows[0].presettlement_link_id) {
          console.log(`${t.load_number}: SKIP -- already linked to ${loadRow.rows[0].presettlement_link_id}`);
          results.push({ load_number: t.load_number, status: "skip_already_linked" });
          await client.query("ROLLBACK");
          continue;
        }

        const settlementRow = await client.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_settlements
             WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid AND display_id=$3 AND voided_at IS NULL AND status::text='open'`,
          [USMCA_ID, t.driver_id, t.settlement_display]
        );
        if (!settlementRow.rows[0]) throw new Error(`${t.load_number}: open pre-settlement ${t.settlement_display} not found for driver`);

        const result = await reassignLoadToSettlementInClientTx(client as never, {
          operating_company_id: USMCA_ID,
          load_id: loadRow.rows[0].id,
          target_settlement_id: settlementRow.rows[0].id,
          actor_user_id: OWNER_USER_ID,
          reason: `ROUND 189 step 4 follow-up: ${t.load_number} was booked via bookLoad() with trip_type/tour_id omitted to avoid uq_driver_settlements_one_open_per_driver (driver already had an open pre-settlement); linking it now to that same pre-settlement.`,
        });
        if ((result as { kind: string }).kind !== "ok") throw new Error(`${t.load_number}: reassign ${JSON.stringify(result)}`);

        await client.query("COMMIT");
        console.log(`${t.load_number}: linked to ${t.settlement_display} (${settlementRow.rows[0].id})`);
        results.push({ load_number: t.load_number, status: "linked", settlement: t.settlement_display, settlement_id: settlementRow.rows[0].id });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    console.log(JSON.stringify(results, null, 2));
    console.log("DONE.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
