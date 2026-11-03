#!/usr/bin/env tsx
// BATCH41 ROW-85 remediation — USMCA loads 13663 / 13687 / 13688
// ROOT CAUSE: each has 1 live driver_bill with accrued_bill_id IS NULL (missed by the inline
// delivery-accrual latch; the cron sweep excludes bills whose loads show no delivered basis yet
// or whose due_date_basis hasn't been stamped). This script runs accrueDriverPayAtDeliveryInClientTx
// for each load directly, then verifies accrued_bill_id IS NOT NULL for each bill.
// OWNER LAW: no financial data invented; the accrual writer is idempotent.
//
// Run: npx tsx scripts/ops/2026-11-03-cc1-driver-pay-accrual-loads-13663-13687-13688.ts
// Set DATABASE_URL or DATABASE_DIRECT_URL to the prod Neon connection string first.

import { pool, withLuciaBypass } from "../../apps/backend/src/auth/db.js";
import { accrueDriverPayAtDeliveryInClientTx } from "../../apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";
const LOAD_NUMBERS = [13663, 13687, 13688];

async function main() {
  console.log("BATCH41-ROW85 accrual repair — USMCA loads", LOAD_NUMBERS.join(", "));

  // Resolve load IDs from load numbers
  const idRes = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    return client.query<{ id: string; load_number: number }>(
      `SELECT id::text, load_number FROM mdata.loads WHERE load_number = ANY($1::int[]) AND operating_company_id = $2::uuid ORDER BY load_number`,
      [LOAD_NUMBERS, USMCA]
    );
  });

  const loads = idRes.rows;
  if (loads.length !== LOAD_NUMBERS.length) {
    console.error(`Expected ${LOAD_NUMBERS.length} loads, found ${loads.length}:`, loads.map((r) => r.load_number));
    process.exit(1);
  }

  for (const { id: loadId, load_number } of loads) {
    console.log(`\nLoad ${load_number} (${loadId}):`);

    // Pre-flight: check current accrued_bill_id state
    const pre = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
      return client.query<{ id: string; accrued_bill_id: string | null; gross_amount_cents: number }>(
        `SELECT id::text, accrued_bill_id::text, gross_amount_cents FROM driver_finance.driver_bills WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND status <> 'void' ORDER BY created_at`,
        [loadId, USMCA]
      );
    });

    for (const bill of pre.rows) {
      console.log(`  driver_bill ${bill.id}: accrued_bill_id=${bill.accrued_bill_id ?? "NULL"} gross=${bill.gross_amount_cents}`);
    }

    if (pre.rows.every((b) => b.accrued_bill_id !== null)) {
      console.log(`  → already accrued, skipping`);
      continue;
    }

    // Run the accrual writer
    const result = await withLuciaBypass(
      (client) =>
        accrueDriverPayAtDeliveryInClientTx(client, {
          operatingCompanyId: USMCA,
          loadId,
          actorUserId: SYSTEM_USER_ID,
        }),
      { actorUserId: SYSTEM_USER_ID }
    );

    console.log(`  accrual result: accrued=${result.accrued.length} skipped=${result.skipped?.length ?? 0}`);
    for (const a of result.accrued) {
      console.log(`    bill ${a.driver_bill_id} → accounting bill ${a.accounting_bill_id}`);
    }

    // Post-flight: verify accrued_bill_id IS NOT NULL
    const post = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
      return client.query<{ id: string; accrued_bill_id: string | null }>(
        `SELECT id::text, accrued_bill_id::text FROM driver_finance.driver_bills WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND status <> 'void'`,
        [loadId, USMCA]
      );
    });

    const unaccrued = post.rows.filter((b) => b.accrued_bill_id === null);
    if (unaccrued.length > 0) {
      console.error(`  FAIL: ${unaccrued.length} bill(s) still have accrued_bill_id=NULL after accrual`);
      process.exit(1);
    }
    console.log(`  PASS: accrued_bill_id set on all bills for load ${load_number}`);
  }

  console.log("\nDONE — all 3 loads accrued.");
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
