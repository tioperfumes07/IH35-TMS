#!/usr/bin/env tsx
// TASK 37 (Lead, Round 38.1/39.2, 2026-09-23): "reports.ifta_filings = 0 ROWS. NO IFTA FILING
// HAS EVER BEEN PRODUCED... EXERCISE IT -- produce the first real filing for the current quarter
// from the 46,994+ gallons now carrying jurisdiction. Report what it needs that does not exist
// yet (miles per jurisdiction is the likely gap)."
//
// NOT A NEW PREPARER -- calls the real, already-built, already-mounted prepareFiling()
// (apps/backend/src/reports/ifta/quarterly-preparer.service.ts, behind POST /api/v1/reports/
// ifta/prepare). Produces a status='draft' row only -- never files anything externally, never
// approves, never marks filed. Safe to run and re-run (ON CONFLICT (operating_company_id, quarter)
// DO UPDATE -- idempotent).
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { prepareFiling } from "../../apps/backend/src/reports/ifta/quarterly-preparer.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const QUARTER = "2026-Q3"; // current quarter as of this session (2026-09-22)

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const filing = await prepareFiling(client, USMCA_COMPANY_ID, QUARTER, OWNER_USER_ID);
  console.log(`Prepared filing ${filing.uuid} for ${QUARTER}, status=${filing.status}.`);
  console.log(JSON.stringify(filing.filing_data, null, 2));

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
