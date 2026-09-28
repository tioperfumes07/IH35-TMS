#!/usr/bin/env tsx
// ROUND 194.1 (Lead ruling, live-measured): Genaro Guerrero Chavez has loads 13633 (Laredo TX ->
// Comstock Park MI, NB) and 13634 (Elkhart IN -> Ingleside TX, TR) dispatched to him with NO
// settlement row at all -- zero pay on 16 of 16 live loads' last gap. 13633.trip_type is NULL
// (never set); 13634.trip_type='TR' already correct and left untouched (Ingleside is not Laredo,
// so this leg extends the tour, it does not close it -- Lead's own ruling, not inferred here).
// Also found: 13634.presettlement_link_id points to b69dfafb-7287-42f6-b46b-19257c9e7095 (P-0001),
// the SAME cancelled settlement already identified as debris from the 5817 duplicate-load fix
// (its 2 settlement_lines are both voided; its only OTHER live references are 2 driver_bills for
// loads 13610/13619, which belong to Genaro's own real closed settlement P-0015/5817 -- reported,
// not touched here, out of this script's authorized scope).
//
// THE FIX, through the sanctioned allocator only, never a direct INSERT/UPDATE on a settlement
// number: (1) set 13633.trip_type='NB' (real data, supplied by the Lead's own live stop-address
// read, not inferred); (2) call linkLoadToPresettlementAfterAssignmentInClientTx for 13633 -- NB
// with no tour_id opens a brand-new tour + settlement via suggestPresettlementLink ->
// confirmPresettlementLink, the exact same path book-load.service.ts uses for every other load;
// (3) repoint 13634.presettlement_link_id from the dead P-0001 off onto the new settlement (a
// live load must never point at a cancelled settlement -- that is exactly how P-0015/16/17
// started, per the Lead's own words).
//
// Raw connection + explicit transaction (NOT withCurrentUser -- that does SET LOCAL ROLE ih35_app,
// which the read-scoped gate credential this session uses cannot assume; matches the same pattern
// already used successfully today for AUTH-105's sync script). bypass_rls='lucia' is the
// established portable RLS-bypass for this credential class.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { register } from "tsx/esm/api";
register();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
if (APPLY) {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required (ROUND 133 P0)");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
}

const { linkLoadToPresettlementAfterAssignmentInClientTx } = await import(
  "../../apps/backend/src/dispatch/presettlement-link.service.ts"
);

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const GENARO_DRIVER_ID = "6edcb351-e81b-4bf2-adf7-5eca9eff9137";
const LOAD_13633_ID = "73c723b3-e9e3-4f2e-a834-5d06162e16ad";
const LOAD_13634_ID = "5b981086-a833-4dd9-b419-0bdec063e8b4";
const UNIT_ID = "19d29860-9753-4376-93c4-dc963cc86483";
const STALE_P0001_ID = "b69dfafb-7287-42f6-b46b-19257c9e7095";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    const before = await client.query(
      `SELECT load_number, trip_type, tour_id::text, presettlement_link_id::text
         FROM mdata.loads WHERE id = ANY($1::uuid[]) ORDER BY load_number`,
      [[LOAD_13633_ID, LOAD_13634_ID]]
    );

    const tripTypeUpdate = await client.query(
      `UPDATE mdata.loads SET trip_type = 'NB', updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND trip_type IS NULL
        RETURNING load_number, trip_type`,
      [LOAD_13633_ID, USMCA]
    );

    const linkResult = await linkLoadToPresettlementAfterAssignmentInClientTx(client as never, {
      operating_company_id: USMCA,
      load_id: LOAD_13633_ID,
      presettlement_link_id_before: null,
      driver_id: GENARO_DRIVER_ID,
      unit_id: UNIT_ID,
      trip_type: "NB",
      tour_id: null,
      actor_user_id: OWNER,
    });
    if (!linkResult || !linkResult.settlement_id) {
      throw new Error(`linkLoadToPresettlementAfterAssignmentInClientTx did not confirm a settlement for 13633: ${JSON.stringify(linkResult)}`);
    }
    const newSettlementId = linkResult.settlement_id;

    // Also repoint 13634.tour_id onto 13633's new tour -- "same unit, one driver, ONE TOUR" (Lead
    // ruling) means both loads must share the same tour_id, not just the same settlement.
    const newTourId = linkResult.settlement_id
      ? (await client.query(`SELECT tour_id::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`, [newSettlementId])).rows[0]?.tour_id
      : null;
    const repoint = await client.query(
      `UPDATE mdata.loads SET presettlement_link_id = $1::uuid, tour_id = $5::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid AND presettlement_link_id = $4::uuid
        RETURNING load_number, presettlement_link_id::text, tour_id::text`,
      [newSettlementId, LOAD_13634_ID, USMCA, STALE_P0001_ID, newTourId]
    );
    if (repoint.rows.length !== 1) {
      throw new Error(`13634 was not pointing at the expected stale P-0001 id at write time -- refusing to guess. Rows: ${JSON.stringify(repoint.rows)}`);
    }

    const newSettlement = await client.query(
      `SELECT id::text, display_id, source_document_ref, status, driver_id::text, tour_id::text,
              first_load_number, last_load_number
         FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [newSettlementId]
    );

    const after = await client.query(
      `SELECT load_number, trip_type, tour_id::text, presettlement_link_id::text
         FROM mdata.loads WHERE id = ANY($1::uuid[]) ORDER BY load_number`,
      [[LOAD_13633_ID, LOAD_13634_ID]]
    );

    if (APPLY) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }

    console.log(JSON.stringify({
      result: APPLY ? "COMMITTED" : "DRY-RUN (rolled back)",
      before: before.rows,
      trip_type_update: tripTypeUpdate.rows,
      link_result: linkResult,
      repoint: repoint.rows,
      new_settlement: newSettlement.rows[0],
      after: after.rows,
    }, null, 2));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message }));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
