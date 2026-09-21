#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3, batch 2 -- recompute driver_finance.driver_settlements headers for
// 5804-5816 after correcting their driver_bills/settlement_lines (earnings/deadhead_pay) to match
// the AlwaysTrack document. Uses the same real, already-shipped recomputeSettlementHeader()
// (settlement-load-reassignment.service.ts) the B5 load-reassignment primitive and ROUND 26.3 STEP
// 4A already use against locked/closed settlements -- status-agnostic, no new GL math.
import pg from "pg";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const IDS: Record<string,string> = {
  "5804":"48341005-1ac9-4a32-bd7b-f78479782a99",
  "5805":"6a8ecf55-c321-4648-bb05-17fada8881a4",
  "5806":"f5305500-726f-4650-ab1c-ebef26db4c31",
  "5807":"89c90396-28b3-46cd-8920-2c496e499b2f",
  "5808":"63a8333b-8446-4426-bd34-4277997608ec",
  "5809":"4db66351-c523-43a4-b949-bd4d9c42e5a2",
  "5810":"f074c0c9-266c-4fc6-9c1e-446d702ced49",
  "5811":"222c0d6b-9c2c-4751-ba08-affd64a993a3",
  "5812":"63145f15-a749-4b86-adc6-254be14d31c7",
  "5813":"e47e64e2-33cf-4c27-abf2-4e3ee5dbc95e",
  "5814":"d00faf77-0d38-451a-807f-54a594c318f5",
  "5815":"00027149-1c90-4bc1-b213-0a6d6d614ac6",
  "5816":"bbc27108-9c50-4aec-ab9c-9b25246309a0",
};

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  for (const [doc, id] of Object.entries(IDS)) {
    const { method } = await recomputeSettlementHeader(client as never, id, USMCA_COMPANY_ID);
    const r = await client.query<{ gross_pay: string; deductions_total: string; reimbursements_total: string; net_pay: string }>(
      `SELECT gross_pay::text, deductions_total::text, reimbursements_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id=$1::uuid`,
      [id]
    );
    const row = r.rows[0]!;
    console.log(`${doc} method=${method} gross=${row.gross_pay} ded=${row.deductions_total} reimb=${row.reimbursements_total} net=${row.net_pay}`);
  }
  await client.query("COMMIT");
  client.release();
  await pool.end();
}
await main();
