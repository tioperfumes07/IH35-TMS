#!/usr/bin/env node
// ROUND 23.3, B6 (owner, 2026-09-13, verbatim): "B6 doesn't wait: link all 79 bills to whatever
// settlement holds their load today. The primitive carries the links when it moves them."
//
// This is the idempotent, permanent, re-runnable source of the live backfill that already ran this
// session: every live (voided_at IS NULL) driver_finance.driver_bills row with
// settled_in_settlement_id IS NULL gets it set to its own load's CURRENT
// mdata.loads.presettlement_link_id -- a plain fact-of-current-state backfill, not a restructure.
// No new write path, no GL, no reversal -- settled_in_settlement_id carries no FK constraint today
// (confirmed live) and no trigger blocks this UPDATE.
//
// Live result this session: 74 of 79 linked. The remaining 5 (loads 13526, 13561, 13567, 13571,
// 13574) have NO settlement at all yet (mdata.loads.presettlement_link_id IS NULL) -- there is
// nothing to link them TO until B5's move/reassignment primitive (scripts/ops/
// settlement-load-reassignment.service.ts, authorized 2026-09-13) assigns those loads a settlement.
// This script is safe to re-run: ON conflict there is none (a plain UPDATE ... WHERE ... IS NULL),
// so re-running after B5 assigns those 5 loads will pick them up automatically.
import pg from "pg";

const LABEL = "b6-driver-bill-settlement-link";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const before = await client.query(
      `SELECT count(*) AS n FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND settled_in_settlement_id IS NULL`,
      [USMCA_COMPANY_ID]
    );

    const res = await client.query(
      `UPDATE driver_finance.driver_bills db
          SET settled_in_settlement_id = l.presettlement_link_id, updated_at = now()
         FROM mdata.loads l
        WHERE db.load_id = l.id AND db.operating_company_id = l.operating_company_id
          AND db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NOT NULL
        RETURNING db.id`,
      [USMCA_COMPANY_ID]
    );

    const remaining = await client.query(
      `SELECT db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NULL`,
      [USMCA_COMPANY_ID]
    );

    await client.query("COMMIT");
    console.log(
      `${LABEL}: was ${before.rows[0].n} unlinked live bills; linked ${res.rowCount} to their load's current settlement; ` +
        `${remaining.rows.length} still unlinked (load has no settlement yet: ${remaining.rows.map((r) => r.load_number).join(", ") || "none"}).`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

await main();
