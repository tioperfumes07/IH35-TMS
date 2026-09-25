#!/usr/bin/env node
// ROUND 181, Step 2 — Driver Settlements Payable per-driver children.
//
// The parent "Driver Settlements Payable" (2200, Liability) exists but has 0 children.
// Siblings exist as models:
//   - "Driver Cash Advances Receivable" (1245, Asset) — 28 children
//   - "Driver Escrow - Held in Trust" (2100, Liability) — 1 child
//
// This script creates one child per real driver (20 Active + 2 Probation = 22),
// named `<DRIVER NAME>`, with NO auto-generated account number (NULL).
//
// DRY RUN by default. --apply requires AUTH text from the Lead.
//
// Usage:
//   node scripts/ops/2026-09-25-devin-b-driver-settlements-payable-children.mjs           # dry run
//   node scripts/ops/2026-09-25-devin-b-driver-settlements-payable-children.mjs --apply    # apply (requires AUTH)

import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "driver-settlements-payable-children";
const PARENT_ACCOUNT_NUMBER = "2200";
const PARENT_ACCOUNT_NAME = "Driver Settlements Payable";

async function main() {
  const apply = process.argv.includes("--apply");
  const authIndex = process.argv.indexOf("--auth");
  const auth = authIndex >= 0 ? process.argv[authIndex + 1] : null;

  if (apply && !auth) {
    console.error(`${LABEL}: --apply requires --auth "<AUTH text from Lead>"`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
    await client.query(`SELECT set_config('app.operating_company_id','${USMCA_COMPANY_ID}',false)`);

    // 1. Resolve the parent account
    const parentRes = await client.query(
      `SELECT id::text, account_number, account_name, account_type, account_subtype
         FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid
          AND account_number = $2
          AND account_type = 'Liability'
          AND deactivated_at IS NULL
          AND parent_account_id IS NULL
        LIMIT 1`,
      [USMCA_COMPANY_ID, PARENT_ACCOUNT_NUMBER],
    );

    if (parentRes.rows.length === 0) {
      console.error(`${LABEL}: parent account ${PARENT_ACCOUNT_NUMBER} "${PARENT_ACCOUNT_NAME}" not found`);
      process.exit(1);
    }

    const parent = parentRes.rows[0];
    console.log(`${LABEL}: parent resolved — ${parent.account_number} ${parent.account_name} (${parent.account_type})`);
    console.log("");

    // 2. Get the 22 real drivers (20 Active + 2 Probation)
    const driversRes = await client.query(
      `SELECT id::text, first_name, last_name, status
         FROM mdata.drivers
        WHERE operating_company_id = $1::uuid
          AND is_sample_data IS NOT TRUE
          AND status IN ('Active', 'Probation')
          AND deactivated_at IS NULL
        ORDER BY first_name, last_name`,
      [USMCA_COMPANY_ID],
    );

    console.log(`${LABEL}: ${driversRes.rows.length} real drivers found (${driversRes.rows.filter(d => d.status === 'Active').length} Active + ${driversRes.rows.filter(d => d.status === 'Probation').length} Probation)`);
    console.log("");

    // 3. Plan the children
    const plans = [];
    for (const driver of driversRes.rows) {
      const fullName = `${driver.first_name} ${driver.last_name}`.trim();

      // Check if child already exists
      const existingRes = await client.query(
        `SELECT id::text FROM catalogs.accounts
          WHERE operating_company_id = $1::uuid
            AND parent_account_id = $2::uuid
            AND account_name = $3
            AND deactivated_at IS NULL
          LIMIT 1`,
        [USMCA_COMPANY_ID, parent.id, fullName],
      );

      if (existingRes.rows.length > 0) {
        plans.push({ driver, fullName, action: "skip_exists", existingId: existingRes.rows[0].id });
      } else {
        plans.push({ driver, fullName, action: "create" });
      }
    }

    // 4. Print the plan
    console.log("  #  Driver Name                              Status     Action");
    console.log("  " + "-".repeat(70));
    let createCount = 0;
    let skipCount = 0;
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const action = p.action === "create" ? "CREATE" : "SKIP (exists)";
      console.log(`  ${String(i + 1).padStart(2)}  ${p.fullName.padEnd(40)} ${p.driver.status.padEnd(10)} ${action}`);
      if (p.action === "create") createCount++;
      else skipCount++;
    }
    console.log("");
    console.log(`${LABEL}: ${createCount} to create, ${skipCount} already exist, ${plans.length} total`);

    if (!apply) {
      console.log("");
      console.log(`${LABEL}: DRY RUN — no writes. Use --apply --auth "<AUTH text>" to execute.`);
      await client.query("ROLLBACK");
      return;
    }

    // 5. Apply (with AUTH)
    console.log("");
    console.log(`${LABEL}: APPLY — AUTH: ${auth}`);
    console.log("");

    for (const p of plans) {
      if (p.action !== "create") continue;

      const ins = await client.query(
        `INSERT INTO catalogs.accounts (
            account_number, account_name, account_type, account_subtype, parent_account_id,
            qbo_account_id, is_postable, currency_code,
            notes, created_by_user_id, updated_by_user_id, operating_company_id
          )
          VALUES (NULL, $1, 'Liability', $2, $3::uuid, NULL, true, 'USD',
            'Auto-provisioned driver settlements payable sub-account (driver $4)',
            NULL, NULL, $5::uuid)
          RETURNING id::text`,
        [p.fullName, parent.account_subtype, parent.id, p.driver.id, USMCA_COMPANY_ID],
      );

      console.log(`  CREATED: ${p.fullName} -> ${ins.rows[0].id}`);
    }

    await client.query("COMMIT");
    console.log("");
    console.log(`${LABEL}: DONE — ${createCount} children created under ${parent.account_number} ${parent.account_name}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: ERROR — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
