#!/usr/bin/env tsx
// ROUND 23.3 DELTA 3 (owner, 2026-09-13, verbatim): "THE LAST THREE FARO LOADS WITH NO SETTLEMENT
// ... These are three of your five still-unlinked driver bills (13526, 13561, 13567, 13571, 13574).
// Close them with B6 linkage -- no re-cut needed, no new primitive. All three loads are closed and
// all three are on AlwaysTrack documents, so the target settlement already exists."
//
// Live-confirmed (this session, matches the owner's own measurement): 13526/13561/13567 each have
// presettlement_link_id IS NULL and settled_in_settlement_id IS NULL, and each has a real, existing,
// pre-seeded shell settlement for its own AlwaysTrack document (13526 -> doc 5779 -> S-2026-5779;
// 13561/13567 -> doc 5795 -> S-2026-5795, both status='locked', both already carrying the correct
// source_document_ref). This is a plain first-time link (from_settlement_id=null case), using the
// ALREADY-BUILT, ALREADY-TESTED, ALREADY-REHEARSED reassignLoadToSettlementInClientTx primitive
// (PR #22045/#22047) -- no new write path, no re-cut of any other document, exactly per the owner's
// instruction. The other 2 of the 5 originally-unlinked loads (13571, 13574, doc 5799) are NOT
// touched here -- the owner named only these three.
import pg from "pg";
import { reassignLoadToSettlementInClientTx } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGETS = [
  { load_number: "13526", load_id: "2c65153d-7a81-4b20-a124-c24348a71885", doc: "5779", settlement_id: "11867eba-3ae2-4f5a-a119-eb61c0b24fe8" },
  { load_number: "13561", load_id: "e1dbb85d-9994-4c93-8433-0233eaefb90b", doc: "5795", settlement_id: "41c422bb-27b1-4ffe-942e-7acc9f133af2" },
  { load_number: "13567", load_id: "44517802-c805-4ba5-8cb6-9f7e9521203a", doc: "5795", settlement_id: "41c422bb-27b1-4ffe-942e-7acc9f133af2" },
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  // PRE-FLIGHT -- re-verify every premise live, do not trust the earlier trace blindly.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    for (const t of TARGETS) {
      const load = await c.query(
        `SELECT presettlement_link_id::text FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [t.load_id, USMCA_COMPANY_ID]
      );
      const shell = await c.query(
        `SELECT status, source_document_ref FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [t.settlement_id, USMCA_COMPANY_ID]
      );
      console.log(`PRE-FLIGHT ${t.load_number}: load.presettlement_link_id=${load.rows[0]?.presettlement_link_id ?? "MISSING"}, shell=${JSON.stringify(shell.rows[0])}`);
      if (load.rows[0]?.presettlement_link_id !== null) throw new Error(`ABORT: ${t.load_number} premise changed -- already has a settlement`);
      if (shell.rows[0]?.source_document_ref !== t.doc) throw new Error(`ABORT: ${t.load_number}'s target shell ref mismatch -- premise changed`);
    }
    await c.query("COMMIT");
    c.release();
  }

  // THE LINK -- one transaction per load, using the existing primitive, no new write path.
  for (const t of TARGETS) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const result = await reassignLoadToSettlementInClientTx(c, {
        operating_company_id: USMCA_COMPANY_ID,
        load_id: t.load_id,
        target_settlement_id: t.settlement_id,
        actor_user_id: OWNER_USER_ID,
        reason: `ROUND 23.3 DELTA 3: first-time link, load ${t.load_number} -> pre-seeded shell for AlwaysTrack doc ${t.doc}`,
      });
      console.log(`LINK ${t.load_number} -> doc ${t.doc}:`, JSON.stringify(result));
      if (result.kind !== "ok") throw new Error(`ABORT: ${t.load_number} did not link: ${JSON.stringify(result)}`);
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      console.error(`ROLLED BACK ${t.load_number}:`, err);
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
    const after = await c.query(
      `SELECT l.load_number, l.presettlement_link_id::text, db.settled_in_settlement_id::text
         FROM mdata.loads l
         JOIN driver_finance.driver_bills db ON db.load_id = l.id AND db.voided_at IS NULL
        WHERE l.load_number IN ('13526','13561','13567') AND l.operating_company_id = $1::uuid
        ORDER BY l.load_number`,
      [USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("POST-FLIGHT:", JSON.stringify(after.rows, null, 2));
    for (const row of after.rows as any[]) {
      const expected = TARGETS.find((t) => t.load_number === row.load_number)!.settlement_id;
      if (row.presettlement_link_id !== expected || row.settled_in_settlement_id !== expected) {
        throw new Error(`POST-FLIGHT FAIL: ${row.load_number} did not land correctly: ${JSON.stringify(row)}`);
      }
    }
    console.log("POST-FLIGHT PASS -- all 3 loads + their driver bills now linked to their document's pre-seeded shell settlement.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
