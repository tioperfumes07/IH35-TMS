#!/usr/bin/env tsx
// GL DEFECT FIX 4 -- 1000-series "Driver Cash Advance" reads -$990.00. Four historical-backfill
// driver_advances rows had their RECOVERY credit posted but their original DISBURSEMENT debit
// never posted: CA-SEP-61727a46 $200 / CA-BF-3445cf68 $200 / CA-BF-a785bea7 $390 /
// CA-BF-40022039 $200 = $990.00 exactly. All 4 are status='recovered', outstanding_balance=0.00,
// disbursement_status='disbursed' -- no driver owes anything; the account should read $0.00 once
// the missing debit lands (it will be immediately offset by the already-posted recovery credit).
//
// Reused, real posting path only -- postSourceTransaction(source_transaction_type:'driver_advance')
// -> buildDriverAdvanceLines (posting-engine.service.ts) reads driver_finance.driver_advances
// directly (amount, disbursement_status, posting_date) and posts DEBIT the mapped Driver Cash
// Advance account / CREDIT the disbursement's own from_bank_account_id or the company default.
// No new GL math.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { postSourceTransaction, PostingEngineError } from "../../apps/backend/src/accounting/posting-engine.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const DISPLAY_IDS = ["CA-SEP-61727a46", "CA-BF-3445cf68", "CA-BF-a785bea7", "CA-BF-40022039"];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const rows = await client.query<{ id: string; display_id: string; amount: string; status: string; outstanding_balance: string; disbursement_status: string }>(
    `SELECT id::text, display_id, amount::text, status, outstanding_balance::text, disbursement_status
       FROM driver_finance.driver_advances
      WHERE operating_company_id=$1::uuid AND display_id = ANY($2::text[])`,
    [USMCA_COMPANY_ID, DISPLAY_IDS]
  );
  client.release();
  await pool.end();

  console.log(`Found ${rows.rowCount} of ${DISPLAY_IDS.length} named advances.`);
  for (const r of rows.rows) {
    console.log(`  ${r.display_id} amount=${r.amount} status=${r.status} outstanding=${r.outstanding_balance} disbursement_status=${r.disbursement_status}`);
  }
  if (rows.rowCount !== DISPLAY_IDS.length) {
    console.error("ABORT: not all 4 named advances found live -- refusing to guess which are missing.");
    process.exitCode = 1;
    return;
  }

  if (!executeFlag) {
    console.log("DRY RUN -- would call postSourceTransaction(driver_advance) for each id above.");
    return;
  }

  let posted = 0;
  let failed = 0;
  for (const r of rows.rows) {
    try {
      const result = await postSourceTransaction(
        { operating_company_id: USMCA_COMPANY_ID, source_transaction_type: "driver_advance", source_transaction_id: r.id },
        { userId: OWNER_USER_ID, role: "Owner" }
      );
      console.log(`  POSTED ${r.display_id} -> journal_entry_id=${result.journal_entry_id}`);
      posted++;
    } catch (err) {
      failed++;
      if (err instanceof PostingEngineError) {
        console.error(`  BLOCKED ${r.display_id}: ${err.message}`);
      } else {
        console.error(`  FAILED ${r.display_id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log(`\nEXECUTE done: posted ${posted}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
