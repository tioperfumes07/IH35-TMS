#!/usr/bin/env tsx
// ROUND 23.3 (owner/Lead, 2026-09-13) — B1 "FUEL AS A REAL COST", second half.
//
// "De-dupe: matching 'Diesel' expense re-pointed to its fuel transaction (needs
// source_fuel_transaction_id column); non-matching expense VOIDED (void_reason=
// 'ABSORPTION-D5 duplicate or unmatched fuel row')."
//
// 95 live, non-voided accounting.expenses rows with memo ILIKE 'Diesel%' were
// matched against the now-live fuel.fuel_transactions (171 rows, see
// scripts/ops/absorption-b1-fuel-ingest.mjs) by (transaction_date, invoice
// number stripped of any trailing "-L<load>" suffix some rows carry, amount) --
// degrading to (transaction_date, amount) when vendor_document_number is the
// literal placeholder "no-invoice" and the fuel row itself has a NULL
// transaction_reference. 93 of 95 matched (one ambiguous pair disambiguated by
// the expense's own load_id against the fuel row's load_id -- both landed on
// invoice 1848853's two genuinely-separate cross-load rows).
//
// The RE-POINT half for those 93 matched rows needs
// accounting.expenses.source_fuel_transaction_id, which does not exist yet
// (blocked on the migration already escalated to CC-1 in
// docs/bus/INBOX-CC-1.md) -- NOT done by this script. This script only does
// the VOID half, for the 2 rows that have NO possible match: both are tagged
// "settlement 5782", and 5782 has NO company-side settlement document at all
// (owner named this in the original ROUND 23.3 spec) -- there is no
// fuel_purchases[] source data anywhere in
// data/alwaystrack/settlements-truth-2026-09-13.json to substantiate them
// against, so per the rule above they are the "non-matching expense" case.
//
// Uses the REAL, existing void mechanism (governance/void-cancel-executors.ts's
// executeExpense via executeVoidCancel("expense", ctx)) -- the exact same
// atomic reversal + status-flip + audit path POST /api/v1/expenses/:id/void
// uses, called directly with a plain pg client (same established pattern as
// scripts/ops/2026-09-07-cc1-acct-f26031-rebase-load-13541.ts). NO new GL math
// is written here.
import pg from "pg";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const VOID_REASON = "ABSORPTION-D5 duplicate or unmatched fuel row";

// The 2 Diesel expenses tagged settlement 5782 (no company-side doc exists for
// 5782 -- confirmed live: no data/alwaystrack/settlements-truth-2026-09-13.json
// company[] entry with settlement_no '5782', only a driver[] doc).
const TARGET_EXPENSE_IDS = [
  "fc1e34b9-98a2-49cc-bfcb-febf2b67f678", // 2026-08-17, $731.46, inv 99524227
  "0154cb7e-6b14-4d97-9ebc-8b19268ad124", // 2026-08-19, $746.43, inv 99365532
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  // PRE-FLIGHT -- re-verify every premise live, do not trust the earlier trace blindly.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const owner = await c.query(`SELECT role FROM identity.users WHERE id = $1::uuid`, [OWNER_USER_ID]);
    const flag = await c.query(
      `SELECT enabled FROM lib.feature_flag_overrides WHERE flag_key = 'VOID_ENFORCEMENT_ENABLED' AND operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    const rows = await c.query(
      `SELECT id::text, memo, status, posting_status, source_settlement_ref, voided_at::text
         FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
      [TARGET_EXPENSE_IDS, USMCA_COMPANY_ID]
    );
    const noCompanyDoc5782 = await c.query(
      `SELECT count(*) AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND notes LIKE '%doc 5782%'`,
      [USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("PRE-FLIGHT owner role:", JSON.stringify(owner.rows[0]));
    console.log("PRE-FLIGHT void-enforcement flag (USMCA):", JSON.stringify(flag.rows[0]));
    console.log("PRE-FLIGHT target expense rows:", JSON.stringify(rows.rows));
    console.log("PRE-FLIGHT fuel_transactions rows tagged doc 5782 (expect 0 -- no company doc exists):", JSON.stringify(noCompanyDoc5782.rows[0]));

    if (owner.rows[0]?.role !== "Owner") throw new Error("ABORT: actor is not Owner-role -- premises changed");
    if (!flag.rows[0]?.enabled) throw new Error("ABORT: VOID_ENFORCEMENT_ENABLED not on for USMCA");
    if (rows.rows.length !== TARGET_EXPENSE_IDS.length) throw new Error("ABORT: expected expense row(s) not found");
    for (const r of rows.rows as any[]) {
      if (r.status === "void" || r.voided_at) throw new Error(`ABORT: expense ${r.id} already void -- premises changed`);
      if (r.source_settlement_ref !== "5782") throw new Error(`ABORT: expense ${r.id} is not tagged settlement 5782 -- wrong target`);
    }
    if (Number(noCompanyDoc5782.rows[0]?.n) !== 0) throw new Error("ABORT: doc 5782 unexpectedly has fuel_transactions rows -- re-check matching before voiding");
  }

  // VOID -- one call per expense, each its own transaction (matches the route's own per-request scope).
  for (const expenseId of TARGET_EXPENSE_IDS) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
      const result = await executeVoidCancel("expense", {
        client: c,
        operatingCompanyId: USMCA_COMPANY_ID,
        entityId: expenseId,
        action: "void",
        userId: OWNER_USER_ID,
        reason: VOID_REASON,
      });
      console.log(`VOID ${expenseId} result:`, JSON.stringify(result));
      if (result.kind !== "ok") throw new Error(`ABORT: void did not succeed for ${expenseId}: ${JSON.stringify(result)}`);
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    } finally {
      c.release();
    }
  }

  // POST-FLIGHT -- re-read live state.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const rows = await c.query(
      `SELECT id::text, status, posting_status, reversed_by_je_id::text, voided_at::text, void_reason
         FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
      [TARGET_EXPENSE_IDS, USMCA_COMPANY_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("POST-FLIGHT rows:", JSON.stringify(rows.rows, null, 2));
    for (const r of rows.rows as any[]) {
      if (r.status !== "void" || !r.voided_at || r.void_reason !== VOID_REASON) {
        throw new Error(`POST-FLIGHT FAIL: expense ${r.id} not correctly voided: ${JSON.stringify(r)}`);
      }
    }
    console.log("POST-FLIGHT PASS -- both expenses voided with the correct reason.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
