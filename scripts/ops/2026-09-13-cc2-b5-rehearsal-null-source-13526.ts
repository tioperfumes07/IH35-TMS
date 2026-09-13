#!/usr/bin/env tsx
// ROUND 23.3 B5 REHEARSAL, second case (owner, 2026-09-13): loads with NO settlement at all yet
// (5 found this session: 13502, 13505, 13507, 13526, 13527, 13561, 13567, 13571, 13574). Rehearses
// load 13526 (doc 5779) -- confirms the primitive's from_settlement_id=null path works for a real
// first-time link, and that B6's driver_bills.settled_in_settlement_id gets set for the first time
// too ("the primitive carries the links when it moves them").
// REHEARSAL ONLY -- refuses to run against anything but the rehearsal branch.
import pg from "pg";
import {
  createBareSettlementForDocument,
  reassignLoadToSettlementInClientTx,
} from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const REHEARSAL_BRANCH_HOST = "ep-noisy-king-akdz74ox-pooler.c-3.us-west-2.aws.neon.tech";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRIVER_ID = "4ff53886-41cc-434f-ae23-a36a0e3ec8e2";
const LOAD_13526_ID = "2c65153d-7a81-4b20-a124-c24348a71885";
// Ground truth's own dates are inverted for doc 5779 (start 2026-08-18, end 2026-08-17) -- a real
// source anomaly (same class as the fuel-ingestion date typo found earlier this session), not
// invented here. Swapped so period_end >= period_start (the table's own CHECK constraint), disclosed
// rather than silently accepted as given.
const DOC_5779_PERIOD_START = "2026-08-17";
const DOC_5779_PERIOD_END = "2026-08-18";
const DOC_5779_REF = "5779";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(REHEARSAL_BRANCH_HOST)) {
    throw new Error(`ABORT: DATABASE_URL does not point at the rehearsal branch (${REHEARSAL_BRANCH_HOST}) -- refusing to run.`);
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });

  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const before = await c.query(
      `SELECT l.presettlement_link_id::text, db.settled_in_settlement_id::text
         FROM mdata.loads l LEFT JOIN driver_finance.driver_bills db ON db.load_id = l.id AND db.voided_at IS NULL
        WHERE l.id = $1::uuid`,
      [LOAD_13526_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("PRE-FLIGHT:", JSON.stringify(before.rows));
    if (before.rows.some((r: any) => r.presettlement_link_id !== null)) {
      throw new Error("ABORT: premise changed -- load 13526 already has a settlement");
    }
  }

  let newSettlementId = "";
  {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const created = await createBareSettlementForDocument(c, {
        operating_company_id: USMCA_COMPANY_ID,
        driver_id: DRIVER_ID,
        period_start: DOC_5779_PERIOD_START,
        period_end: DOC_5779_PERIOD_END,
        source_document_ref: DOC_5779_REF,
        actor_user_id: OWNER_USER_ID,
        is_sample_data: false,
        status: "closed",
      });
      newSettlementId = created.settlement_id;
      console.log("STEP 1 (create bare settlement for doc 5779):", JSON.stringify(created));

      const move = await reassignLoadToSettlementInClientTx(c, {
        operating_company_id: USMCA_COMPANY_ID,
        load_id: LOAD_13526_ID,
        target_settlement_id: newSettlementId,
        actor_user_id: OWNER_USER_ID,
        reason: "B5 rehearsal: first-time link for a load with no prior settlement",
      });
      console.log("STEP 2 (move load 13526, from_settlement_id expected null):", JSON.stringify(move));
      if (move.kind !== "ok") throw new Error(`ABORT: move did not succeed: ${JSON.stringify(move)}`);
      if (move.from_settlement_id !== null) throw new Error("ABORT: expected from_settlement_id=null, premises changed");

      await c.query("COMMIT");
      console.log("COMMITTED.");
    } catch (err) {
      await c.query("ROLLBACK");
      console.error("ROLLED BACK:", err);
      throw err;
    } finally {
      c.release();
    }
  }

  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const after = await c.query(
      `SELECT l.presettlement_link_id::text, db.settled_in_settlement_id::text
         FROM mdata.loads l LEFT JOIN driver_finance.driver_bills db ON db.load_id = l.id AND db.voided_at IS NULL
        WHERE l.id = $1::uuid`,
      [LOAD_13526_ID]
    );
    const header = await c.query(
      `SELECT display_id, source_document_ref, gross_pay, net_pay FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [newSettlementId]
    );
    await c.query("COMMIT");
    c.release();
    console.log("POST-FLIGHT:", JSON.stringify(after.rows));
    console.log("POST-FLIGHT new settlement:", JSON.stringify(header.rows[0]));
    if (after.rows.some((r: any) => r.presettlement_link_id !== newSettlementId)) {
      throw new Error("POST-FLIGHT FAIL: load not linked to the new settlement");
    }
    if (after.rows.some((r: any) => r.settled_in_settlement_id !== newSettlementId)) {
      throw new Error("POST-FLIGHT FAIL: driver bill not linked (B6's carried-link promise) to the new settlement");
    }
    console.log("POST-FLIGHT PASS -- first-time link worked, and the driver bill's settled_in_settlement_id was carried along with it.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
