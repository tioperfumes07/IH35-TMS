#!/usr/bin/env tsx
// ROUND 23.3 B5 REHEARSAL (owner, 2026-09-13): "Rehearse on a Neon branch now." NOT a prod run.
// Targets Neon branch br-nameless-water-aka2ews6 ("b5-load-reassignment-rehearsal") only -- this
// script refuses to run against any other DATABASE_URL as a guard against an accidental prod hit.
//
// Real B5 case: settlement dac3e8ac-ffc0-43a7-be08-68387ef50e08 (display S-2026-0001, cancelled)
// currently holds all 4 loads from TWO different AlwaysTrack documents merged together: doc 5773
// (loads 13497, 13511 -- already correctly ref'd) and doc 5786 (loads 13533, 13548 -- wrong doc,
// needs its OWN settlement). This rehearses the split: mint a new settlement for doc 5786, then
// move 13533 and 13548 into it via the real primitive, in ONE transaction.
import pg from "pg";
import {
  createBareSettlementForDocument,
  reassignLoadToSettlementInClientTx,
} from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const REHEARSAL_BRANCH_HOST = "ep-noisy-king-akdz74ox-pooler.c-3.us-west-2.aws.neon.tech";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const SOURCE_SETTLEMENT_ID = "dac3e8ac-ffc0-43a7-be08-68387ef50e08"; // doc 5773's current (merged) settlement
const DRIVER_ID = "424a3bb9-60c2-4f16-8d9c-afa6be475ad7"; // Concepcion Cordova Dominguez
const LOAD_13533_ID = "8904580d-6158-4491-9fde-51f1cbbe3fb4";
const LOAD_13548_ID = "a93862c9-e1b8-4ae6-9eb7-125c5f08f491";
const DOC_5786_PERIOD_START = "2026-08-19";
const DOC_5786_PERIOD_END = "2026-08-26";
const DOC_5786_REF = "5786";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(REHEARSAL_BRANCH_HOST)) {
    throw new Error(`ABORT: DATABASE_URL does not point at the rehearsal branch (${REHEARSAL_BRANCH_HOST}) -- refusing to run.`);
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });

  // PRE-FLIGHT
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const before = await c.query(
      `SELECT l.load_number, l.presettlement_link_id::text FROM mdata.loads l WHERE l.id = ANY($1::uuid[])`,
      [[LOAD_13533_ID, LOAD_13548_ID]]
    );
    const sourceHeader = await c.query(
      `SELECT display_id, source_document_ref, status, gross_pay, deductions_total, reimbursements_total, net_pay,
              first_load_id::text, first_load_number, last_load_id::text, last_load_number
         FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [SOURCE_SETTLEMENT_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("PRE-FLIGHT loads:", JSON.stringify(before.rows));
    console.log("PRE-FLIGHT source settlement:", JSON.stringify(sourceHeader.rows[0]));
    if (before.rows.some((r: any) => r.presettlement_link_id !== SOURCE_SETTLEMENT_ID)) {
      throw new Error("ABORT: premise changed -- one of the target loads is no longer on the expected source settlement");
    }
  }

  // THE REHEARSAL MOVE -- one transaction, "or nothing moves."
  let newSettlementId = "";
  {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

      const created = await createBareSettlementForDocument(c, {
        operating_company_id: USMCA_COMPANY_ID,
        driver_id: DRIVER_ID,
        period_start: DOC_5786_PERIOD_START,
        period_end: DOC_5786_PERIOD_END,
        source_document_ref: DOC_5786_REF,
        actor_user_id: OWNER_USER_ID,
        is_sample_data: false,
        status: "closed",
      });
      newSettlementId = created.settlement_id;
      console.log("STEP 1 (create bare settlement for doc 5786):", JSON.stringify(created));

      const move1 = await reassignLoadToSettlementInClientTx(c, {
        operating_company_id: USMCA_COMPANY_ID,
        load_id: LOAD_13533_ID,
        target_settlement_id: newSettlementId,
        actor_user_id: OWNER_USER_ID,
        reason: "B5 rehearsal: split doc 5786's loads off the merged doc-5773/5786 settlement",
      });
      console.log("STEP 2 (move load 13533):", JSON.stringify(move1));
      if (move1.kind !== "ok") throw new Error(`ABORT: move of 13533 did not succeed: ${JSON.stringify(move1)}`);

      const move2 = await reassignLoadToSettlementInClientTx(c, {
        operating_company_id: USMCA_COMPANY_ID,
        load_id: LOAD_13548_ID,
        target_settlement_id: newSettlementId,
        actor_user_id: OWNER_USER_ID,
        reason: "B5 rehearsal: split doc 5786's loads off the merged doc-5773/5786 settlement",
      });
      console.log("STEP 3 (move load 13548):", JSON.stringify(move2));
      if (move2.kind !== "ok") throw new Error(`ABORT: move of 13548 did not succeed: ${JSON.stringify(move2)}`);

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

  // POST-FLIGHT
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const loadsAfter = await c.query(
      `SELECT load_number, presettlement_link_id::text FROM mdata.loads
        WHERE load_number IN ('13497','13511','13533','13548') AND operating_company_id = $1::uuid
        ORDER BY load_number`,
      [USMCA_COMPANY_ID]
    );
    const sourceAfter = await c.query(
      `SELECT display_id, source_document_ref, gross_pay, deductions_total, reimbursements_total, net_pay,
              first_load_id::text, first_load_number, last_load_id::text, last_load_number
         FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [SOURCE_SETTLEMENT_ID]
    );
    const targetAfter = await c.query(
      `SELECT display_id, source_document_ref, gross_pay, deductions_total, reimbursements_total, net_pay,
              first_load_id::text, first_load_number, last_load_id::text, last_load_number
         FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [newSettlementId]
    );
    const billsAfter = await c.query(
      `SELECT db.load_number, db.settled_in_settlement_id::text FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id
        WHERE l.load_number IN ('13497','13511','13533','13548') AND db.operating_company_id = $1::uuid
        ORDER BY db.load_number`,
      [USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("POST-FLIGHT loads:", JSON.stringify(loadsAfter.rows, null, 2));
    console.log("POST-FLIGHT source settlement (doc 5773):", JSON.stringify(sourceAfter.rows[0], null, 2));
    console.log("POST-FLIGHT new settlement (doc 5786):", JSON.stringify(targetAfter.rows[0], null, 2));
    console.log("POST-FLIGHT driver_bills:", JSON.stringify(billsAfter.rows, null, 2));

    const s = sourceAfter.rows[0] as any;
    const t = targetAfter.rows[0] as any;
    const loadMap = Object.fromEntries(loadsAfter.rows.map((r: any) => [r.load_number, r.presettlement_link_id]));
    if (loadMap["13497"] !== SOURCE_SETTLEMENT_ID || loadMap["13511"] !== SOURCE_SETTLEMENT_ID) {
      throw new Error("POST-FLIGHT FAIL: 13497/13511 no longer on the source settlement");
    }
    if (loadMap["13533"] !== newSettlementId || loadMap["13548"] !== newSettlementId) {
      throw new Error("POST-FLIGHT FAIL: 13533/13548 did not land on the new settlement");
    }
    if (s.source_document_ref !== "5773" || t.source_document_ref !== "5786") {
      throw new Error("POST-FLIGHT FAIL: source_document_ref mismatch after split");
    }
    console.log("POST-FLIGHT PASS -- split correctly separated doc 5773 and doc 5786's loads, refs, and headers.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
