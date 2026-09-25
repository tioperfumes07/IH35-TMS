#!/usr/bin/env node
// ROUND 23.3 B6 (owner, 2026-09-13, cited verbatim in verify-driver-bill-settlement-link.mjs):
// "link all 79 bills to whatever settlement holds their load today." verify-driver-bill-
// settlement-link.mjs went live-RED this session (unrelated to any CC-3 diff, confirmed via
// `git log origin/main..HEAD -- scripts/verify-driver-bill-settlement-link.mjs` = empty) for 9
// live driver_bills rows whose load already carries an unambiguous, single, OPEN
// presettlement_link_id but whose own settled_in_settlement_id column was left NULL --
// mirroring the exact "legacy driver_bills pointer... kept in sync" backfill step 5 of
// apps/backend/src/driver-finance/settlement-load-reassignment.service.ts's already-tested
// reassignLoadToSettlementInClientTx primitive, whose own reassign path can't be reused
// directly here (target === current load.presettlement_link_id short-circuits it as
// "already_on_target" -- this is a same-settlement backfill, not a cross-settlement move).
// Reuses that primitive's EXACT WHERE-clause safety shape (only touches a row that is
// currently NULL or already equal to the target, never overwrites a different value), scoped
// to only these 9 specific bill ids -- verified live, not guessed. No GL/journal entry is
// touched; this column is a reference pointer, not a money amount.
//
// AUTH-037 (docs/bus/OWNER-AUTHORIZATIONS.md, owner instruction this session's chat, "fix your
// PRs... and merge all"). Requires OWNER_AUTH_ID=AUTH-037 in the environment; the guard
// scripts/verify-owner-authorization.mjs is run separately before this script, per ROUND 133.
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BILL_IDS = [
  "33fed2b1-b4b2-41b3-a133-6f84536fcb91", // load 90007
  "6228a1f2-eba1-48c5-a795-f7d3ddffdde6", // load 13544
  "b6326fc8-0de2-4a6a-8542-dc7caef1f25d", // load 13563
  "fbc61bde-1197-477d-ac65-0342eaff7771", // load 13610
  "701cb36f-b107-4319-901d-b5ed385c22a4", // load 13612
  "a47b716c-8fb3-48e1-8cbf-d7f6e78047bc", // load 13613
  "02c0b370-45d3-42d2-bddc-e171dd7ff2da", // load 13615
  "a7ff39dd-7247-4bc9-b491-656612cd5ae3", // load 13614
  "ad777115-1317-46e7-ba4b-aa37f0dac7ed", // load 13619
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    // Pre-flight: every target bill's load has exactly one, unambiguous, non-cancelled/non-
    // reversed presettlement_link_id, and the bill is currently NULL (never overwrite a real
    // value -- the primitive's own safety shape).
    const pre = await client.query(
      `SELECT db.id::text, db.load_number, db.settled_in_settlement_id::text AS current_link,
              l.presettlement_link_id::text AS target_settlement, s.status AS settlement_status
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
         LEFT JOIN driver_finance.driver_settlements s ON s.id = l.presettlement_link_id
        WHERE db.id = ANY($1::uuid[]) AND db.operating_company_id = $2::uuid`,
      [BILL_IDS, USMCA]
    );
    if (pre.rows.length !== BILL_IDS.length) {
      throw new Error(`expected ${BILL_IDS.length} rows, found ${pre.rows.length} -- refusing to proceed on an unexpected population`);
    }
    for (const r of pre.rows) {
      if (r.current_link !== null) throw new Error(`bill ${r.id} (load ${r.load_number}) already has settled_in_settlement_id=${r.current_link} -- refusing to overwrite`);
      if (!r.target_settlement) throw new Error(`bill ${r.id} (load ${r.load_number}) has no presettlement_link_id -- refusing, no target`);
      if (r.settlement_status === "cancelled") throw new Error(`bill ${r.id} (load ${r.load_number}) target settlement is cancelled -- refusing`);
    }
    console.log("Pre-flight OK:", pre.rows.map((r) => `${r.load_number}->${r.target_settlement}`).join(", "));

    // The backfill itself -- identical WHERE-clause safety shape to
    // reassignLoadToSettlementInClientTx step 5 (settled_in_settlement_id IS NULL only), scoped
    // to exactly these 9 ids.
    const res = await client.query(
      `UPDATE driver_finance.driver_bills db
          SET settled_in_settlement_id = l.presettlement_link_id, updated_at = now()
         FROM mdata.loads l
        WHERE db.load_id = l.id AND db.operating_company_id = l.operating_company_id
          AND db.id = ANY($1::uuid[]) AND db.operating_company_id = $2::uuid
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NOT NULL
        RETURNING db.id::text, db.load_number, db.settled_in_settlement_id::text`,
      [BILL_IDS, USMCA]
    );
    console.log(`Updated ${res.rowCount} row(s):`, res.rows);
    if (res.rowCount !== BILL_IDS.length) {
      throw new Error(`expected to update ${BILL_IDS.length} rows, updated ${res.rowCount} -- rolling back`);
    }

    await client.query("COMMIT");
    console.log("COMMITTED.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ROLLED BACK:", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
