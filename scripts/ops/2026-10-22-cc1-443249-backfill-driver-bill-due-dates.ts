#!/usr/bin/env tsx
/**
 * LEAD 443.249 item 1 — backfill driver_bills.due_date from load delivery stop.
 *
 * Owner rule: "all driver bills due date is the date of the load delivery."
 * The trigger trg_driver_bill_due_date_at_mint (migration 202615830700, applied 2026-10-12) stamps
 * due_date on INSERT but does NOT backfill bills that already existed (migration said "0 open
 * unsettled" at apply time — but bills approved-into-settlements since then inherited NULL).
 *
 * This script:
 *   1. Finds all open/approved/paid USMCA driver bills with NULL due_date and a load with a
 *      delivery stop.
 *   2. Stamps due_date from driver_finance.load_driver_pay_due (the same function the trigger uses).
 *   3. Lists any bills whose load has no delivery stop (cannot be stamped) for the Lead.
 *   4. Reports before / after counts.
 *
 * Run: npx tsx scripts/ops/2026-10-22-cc1-443249-backfill-driver-bill-due-dates.ts <AUTH-id>
 * DRY RUN (no writes): add --dry-run flag (no AUTH id needed).
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { execFileSync } from "node:child_process";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRY_RUN = process.argv.includes("--dry-run");

// verify-no-unauthorized-production-write: a scripts/ops writer to a financial table must prove the
// owner's authorization BEFORE it writes. A dry run writes nothing and needs none; a real run takes
// the AUTH id as its first non-flag argument and fails closed without it.
if (!DRY_RUN) {
  const auth = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!auth) {
    console.error("Refusing to write: pass the owner AUTH id (or --dry-run).");
    process.exit(1);
  }
  execFileSync("node", [path.resolve(process.cwd(), "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const client = await pool.connect();
try {
  // Use bypass so we can read all bills regardless of RLS.
  // SET LOCAL requires an explicit transaction — withLuciaBypass() pattern for ops scripts.
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

  // Fetch all open/approved/paid bills with NULL due_date.
  const { rows: bills } = await client.query<{
    id: string;
    bill_number: string;
    status: string;
    driver_id: string | null;
    gross_amount_cents: number;
    load_id: string | null;
    settled_in_settlement_id: string | null;
    due_date: string | null;
    delivery_date: string | null;
    delivery_basis: string | null;
  }>(`
    SELECT
      b.id::text,
      b.bill_number,
      b.status,
      b.driver_id::text,
      b.gross_amount_cents::int,
      b.load_id::text,
      b.settled_in_settlement_id::text,
      b.due_date::text,
      d.due_date::text   AS delivery_date,
      d.basis            AS delivery_basis
    FROM driver_finance.driver_bills b
    LEFT JOIN LATERAL (
      SELECT * FROM driver_finance.load_driver_pay_due(b.load_id)
    ) d ON b.load_id IS NOT NULL
    WHERE b.operating_company_id = $1::uuid
      AND b.status IN ('open', 'approved', 'paid')
      AND b.voided_at IS NULL
      AND b.due_date IS NULL
    ORDER BY b.gross_amount_cents DESC
  `, [USMCA]);

  console.log(`Found ${bills.length} bill(s) with NULL due_date.`);

  const canStamp = bills.filter(b => b.delivery_date !== null);
  const noDelivery = bills.filter(b => b.delivery_date === null);

  console.log(`  Can stamp: ${canStamp.length}`);
  console.log(`  No delivery stop (list for Lead): ${noDelivery.length}`);

  if (noDelivery.length > 0) {
    console.log(`\n=== BILLS WITH NO LINKED LOAD DELIVERY (list for Lead — do not guess a date) ===`);
    for (const b of noDelivery) {
      console.log(`  bill_id=${b.id} load=${b.bill_number} status=${b.status} amount=$${(b.gross_amount_cents / 100).toFixed(2)} settlement=${b.settled_in_settlement_id ?? 'none'}`);
    }
  }

  if (canStamp.length === 0) {
    await client.query('ROLLBACK');
    console.log(`\nNothing to stamp. Exiting.`);
    process.exit(0);
  }

  if (DRY_RUN) {
    await client.query('ROLLBACK');
    console.log(`\nDRY RUN — would stamp ${canStamp.length} bills with due_date from delivery stop.`);
    for (const b of canStamp.slice(0, 20)) {
      console.log(`  bill ${b.bill_number} → due_date=${b.delivery_date} (${b.delivery_basis})`);
    }
    if (canStamp.length > 20) console.log(`  ... and ${canStamp.length - 20} more`);
    process.exit(0);
  }

  console.log(`\nStamping ${canStamp.length} bills...`);
  let stamped = 0;
  for (const b of canStamp) {
    const { rowCount } = await client.query(`
      UPDATE driver_finance.driver_bills
         SET due_date = $3::date, due_date_basis = $4
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
         AND due_date IS NULL
    `, [b.id, USMCA, b.delivery_date, b.delivery_basis]);
    if ((rowCount ?? 0) > 0) stamped++;
  }

  await client.query('COMMIT');
  console.log(`\nDONE: ${stamped}/${canStamp.length} bills stamped with delivery due_date.`);
  console.log(`TOTAL amount affected: $${(canStamp.reduce((s, b) => s + b.gross_amount_cents, 0) / 100).toFixed(2)}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
  await pool.end();
}
