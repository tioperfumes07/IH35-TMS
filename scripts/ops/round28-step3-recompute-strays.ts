#!/usr/bin/env tsx
// ROUND 28 STEP 3 — recompute the 4 real-document settlements whose header included stray loads
// (13593 cancelled, 13563/13610/13612/13613/13614 pre-settlement-no-doc-yet, 13609/13616/13617/13618
// dispatched-still-open) that bookLoad's own presettlement auto-link scattered onto them at Step 1
// booking time. Those loads' presettlement_link_id was already cleared (narrow, disclosed, no
// settlement_lines existed for any of them — verified live before the clear). This just re-runs the
// existing, status-agnostic recomputeSettlementHeader on the 4 affected real settlements so their
// gross/deductions/net reflect ONLY their own document's real loads.
import pg from "pg";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const IDS: Record<string, string> = {
  "5807": "89c90396-28b3-46cd-8920-2c496e499b2f",
  "5809": "4db66351-c523-43a4-b949-bd4d9c42e5a2",
  "5810": "f074c0c9-266c-4fc6-9c1e-446d702ced49",
  "5815": "00027149-1c90-4bc1-b213-0a6d6d614ac6",
};

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const client = await pool.connect();
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
  for (const [doc, id] of Object.entries(IDS)) {
    const { method } = await recomputeSettlementHeader(client, id, USMCA_COMPANY_ID);
    const r = await client.query(
      `SELECT gross_pay::numeric(12,2), deductions_total::numeric(12,2), net_pay::numeric(12,2) FROM driver_finance.driver_settlements WHERE id=$1`,
      [id]
    );
    console.log(doc, id, method, JSON.stringify(r.rows[0]));
  }
  client.release();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
