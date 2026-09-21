#!/usr/bin/env tsx
// ROUND 27.1/28 STEP 3 follow-up: the real POST /api/v1/expenses route does not auto-populate
// merchant_address/source_settlement_ref/vendor_document_number-cleanup -- that is a SEPARATE,
// existing, already-sanctioned service (backfillExpenseParsedFields,
// apps/backend/src/accounting/expense-parse-backfill.service.ts, "the ONE real service function
// that populates them ... never a raw ad-hoc UPDATE from a script"). The 41 rows
// scripts/ops/round27-1-step3-create-missing-expenses.ts just created carry the exact composite
// memo grammar that service parses ("<item> — <address> — inv <n> — <date> — $<amt> (settlement
// <n>)") -- this script calls that real function once per newly-created row, exactly as intended.
// One-off, not idempotent-by-design beyond what that service itself already guarantees (it is a
// no-op on a row that already has merchant_address/source_settlement_ref set).
import pg from "pg";
import { backfillExpenseParsedFields } from "../../apps/backend/src/accounting/expense-parse-backfill.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.expenses
      WHERE created_at > now() - interval '30 minutes' AND source_settlement_ref IS NULL
      ORDER BY created_at`
  );
  console.log("rows to backfill:", res.rows.length);
  let ok = 0;
  let fail = 0;
  for (const r of res.rows) {
    const result = await backfillExpenseParsedFields(client as never, {
      operatingCompanyId: USMCA_COMPANY_ID,
      expenseId: r.id,
      actorUserId: OWNER_USER_ID,
    });
    if (result.updated) {
      ok++;
    } else {
      fail++;
      console.log("NOT UPDATED", r.id, result.reason);
    }
  }
  await client.query("COMMIT");
  console.log("ok", ok, "fail", fail);
  client.release();
  await pool.end();
}

await main();
