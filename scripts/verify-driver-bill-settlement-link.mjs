#!/usr/bin/env node
// ROUND 23.3, B6 (owner, 2026-09-13): "link all 79 bills to whatever settlement holds their load
// today." Asserts every live driver bill whose load already carries a settlement is linked; the
// only allowed unlinked rows are ones whose load has NO settlement at all yet (a real B5 gap, not a
// B6 regression).
// Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B). money-pr-local-gate.mjs runs
// it only when this guard's own domain paths change or a live DB is present (Lead ruling R56-B).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import { exitIfEmptyByPurge } from "./lib/purge-window.mjs";

const LABEL = "verify-driver-bill-settlement-link";
export const REQUIRES_LIVE_DB =
  "live-data money guard; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B) and runs in money-pr-local-gate.mjs only when its own domain paths change or a live DB is present (Lead ruling R56-B, 2026-09-22)";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const totalRes = await client.query(
      `SELECT count(*) AS n FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const total = Number(totalRes.rows[0].n);
    if (total === 0) {
      exitIfEmptyByPurge(LABEL, "driver_finance.driver_bills (USMCA, live)");
      console.error(`${LABEL}: LIVE FAIL — 0 live driver_bills rows; completeness discriminator says this is an instrument problem, not a real zero`);
      process.exit(1);
    }

    const badRes = await client.query(
      `SELECT db.id, db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );

    const unassignedRes = await client.query(
      `SELECT db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NULL`,
      [USMCA_COMPANY_ID]
    );

    await client.query("COMMIT");

    if (badRes.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${badRes.rows.length} driver bill(s) unlinked despite their load already carrying a settlement:`);
      for (const r of badRes.rows) console.error(`  ✗ ${r.id} load ${r.load_number}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — every live driver bill whose load carries a settlement is linked ` +
        `(${unassignedRes.rows.length} bill(s) remain unlinked, all blocked on their load having no settlement yet: ${unassignedRes.rows.map((r) => r.load_number).join(", ") || "none"}).`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
