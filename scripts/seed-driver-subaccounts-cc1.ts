#!/usr/bin/env tsx
/**
 * scripts/seed-driver-subaccounts-cc1.ts — CC-1 (443.41-E)
 *
 * Provision missing per-driver escrow + advance sub-accounts for all active USMCA drivers.
 * Immediate trigger: driver e3ac0879 has no Damage-Claim escrow sub-account, blocking settlement
 * 5829 on prod (CC-3 fork refusal, 2026-10-11).
 *
 * Uses the EXACT same service function the live backfill route calls:
 *   POST /api/v1/payroll/driver-subaccount-backfill/apply
 * No raw SQL writes — idempotent provisioners handle the CREATE-or-SKIP logic.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/seed-driver-subaccounts-cc1.ts          # dry-run (default)
 *   DATABASE_URL=<prod> npx tsx scripts/seed-driver-subaccounts-cc1.ts --apply  # write
 *   DATABASE_URL=<prod> npx tsx scripts/seed-driver-subaccounts-cc1.ts --apply --driver-id e3ac0879-...  # single driver
 */
import pg from "pg";
import { runDriverSubAccountBackfill } from "../apps/backend/src/accounting/driver-subaccount-backfill.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID    = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const apply    = process.argv.includes("--apply");
  const driverArg = process.argv.indexOf("--driver-id");
  const singleDriver = driverArg !== -1 ? process.argv[driverArg + 1] : null;

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA_COMPANY_ID]);

    const drivers = singleDriver
      ? await (async () => {
          const r = await client.query<{ id: string; full_name: string; hire_date: string | null }>(
            `SELECT id, full_name, hire_date FROM mdata.drivers WHERE operating_company_id = $1::uuid AND id::text LIKE $2 LIMIT 1`,
            [USMCA_COMPANY_ID, `${singleDriver}%`]
          );
          if (!r.rows[0]) throw new Error(`Driver not found: ${singleDriver}`);
          return [{ driverId: r.rows[0].id, driverName: r.rows[0].full_name, hireDate: r.rows[0].hire_date }];
        })()
      : undefined;

    const report = await runDriverSubAccountBackfill(client as never, {
      operatingCompanyId: USMCA_COMPANY_ID,
      apply,
      actorUserId: apply ? OWNER_USER_ID : undefined,
      drivers,
    });

    await client.query(apply ? "COMMIT" : "ROLLBACK");

    console.log(`\n=== ${apply ? "APPLIED" : "DRY-RUN"} — driver sub-account backfill ===`);
    console.log(`Drivers scanned:  ${report.totals.drivers_scanned}`);
    console.log(`Asset to create:  ${report.totals.asset_to_create}`);
    console.log(`Escrow to create: ${report.totals.escrow_to_create}`);
    console.log(`AP vendor create: ${report.totals.ap_vendor_to_create}`);
    console.log(`Already existing: ${report.totals.already_existing}`);
    console.log(`No parent (skip): ${report.totals.no_parent}`);
    console.log("");

    const needs = report.rows.filter(r => r.escrow_subaccount !== "EXISTS" || r.asset_subaccount !== "EXISTS");
    if (needs.length) {
      console.log("Drivers with missing sub-accounts:");
      for (const row of needs) {
        console.log(`  ${row.driver_id}  ${row.driver_name}  advance=${row.asset_subaccount}  escrow=${row.escrow_subaccount}`);
      }
    }

    if (!apply) {
      console.log("\n--- Re-run with --apply to write ---");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
