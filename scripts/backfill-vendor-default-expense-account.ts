#!/usr/bin/env tsx
/**
 * scripts/backfill-vendor-default-expense-account.ts — REG-002 vendor data completeness.
 *
 * Root cause: 602/602 USMCA vendors have default_expense_account_id = NULL (live-verified
 * 2026-09-10, bypass_rls=lucia). This is a real accounting-mapping gap — the field pre-fills
 * bill lines and is never auto-posted, but a NULL default means the operator must pick the
 * expense account from scratch on every bill, with no suggestion.
 *
 * Fix: rule-based backfill using vendor_type → CoA role → account_id, NOT a guess:
 *   - Driver  → driver_pay_expense role     → "Cost of Labor–Mexico Drivers" (6890)
 *   - Insurance → insurance_expense role    → "Truck Insurance" (5600)
 *   - Other   → uncategorized_expense role → "Ask My Accountant" (9000) — the locked
 *               fallback account per ih35-accounting-decisions §B3:C. The operator refines
 *               on next edit; this is the explicit fallback, never a fabricated guess.
 *
 * Idempotent: only updates rows where default_expense_account_id IS NULL. Re-running is safe.
 * USMCA-scoped only (TRANSP/TRK are frozen — never touched).
 *
 * Usage:
 *   DATABASE_URL=<neon prod> npx tsx scripts/backfill-vendor-default-expense-account.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/backfill-vendor-default-expense-account.ts --apply
 */
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run") || !apply;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // Step 1: resolve CoA role → account_id for the three roles we need
    const roleRes = await client.query(
      `BEGIN;
       SET LOCAL app.bypass_rls = 'lucia';
       SELECT car.role, a.id as account_id, a.account_number, a.account_name
       FROM accounting.chart_of_accounts_roles car
       JOIN catalogs.accounts a ON car.account_id = a.id
       WHERE car.operating_company_id = $1
         AND car.is_active = true
         AND car.role IN ('driver_pay_expense', 'insurance_expense', 'uncategorized_expense')
       ORDER BY car.role;
       COMMIT;`,
      [USMCA_COMPANY_ID]
    );

    // The transaction returns the SELECT result as the last query before COMMIT
    // Actually, pg.Client.query with multiple statements returns the last result.
    // Let's do it properly with separate queries.
  } catch {
    // Fall through to the proper approach below
  }

  // Proper approach: separate queries in a transaction
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const roleRes = await client.query(
    `SELECT car.role, a.id as account_id, a.account_number, a.account_name
     FROM accounting.chart_of_accounts_roles car
     JOIN catalogs.accounts a ON car.account_id = a.id
     WHERE car.operating_company_id = $1
       AND car.is_active = true
       AND car.role IN ('driver_pay_expense', 'insurance_expense', 'uncategorized_expense')
     ORDER BY car.role`,
    [USMCA_COMPANY_ID]
  );

  const roleMap = new Map<string, { account_id: string; account_number: string; account_name: string }>();
  for (const row of roleRes.rows) {
    roleMap.set(row.role, { account_id: row.account_id, account_number: row.account_number, account_name: row.account_name });
  }

  if (roleMap.size < 3) {
    console.error("ERROR: Missing one or more required CoA roles. Found:", [...roleMap.keys()]);
    await client.query("ROLLBACK");
    process.exit(1);
  }

  console.log("CoA role → account mapping:");
  for (const [role, info] of roleMap) {
    console.log(`  ${role} → ${info.account_number} ${info.account_name} (${info.account_id})`);
  }

  // Step 2: count vendors by vendor_type that need backfill
  const gapRes = await client.query(
    `SELECT vendor_type, count(*) as cnt
     FROM mdata.vendors
     WHERE operating_company_id = $1
       AND is_sample_data IS NOT TRUE
       AND deactivated_at IS NULL
       AND default_expense_account_id IS NULL
     GROUP BY vendor_type
     ORDER BY count(*) DESC`,
    [USMCA_COMPANY_ID]
  );

  console.log("\nVendors needing backfill (default_expense_account_id IS NULL):");
  let totalGap = 0;
  for (const row of gapRes.rows) {
    console.log(`  ${row.vendor_type}: ${row.cnt}`);
    totalGap += parseInt(row.cnt, 10);
  }
  console.log(`  TOTAL: ${totalGap}`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes applied. Run with --apply to backfill.");
    await client.query("ROLLBACK");
    return;
  }

  // Step 3: backfill using vendor_type → role → account_id
  const vendorTypeToRole: Record<string, string> = {
    Driver: "driver_pay_expense",
    Insurance: "insurance_expense",
    Other: "uncategorized_expense",
  };

  let totalUpdated = 0;
  for (const [vendorType, role] of Object.entries(vendorTypeToRole)) {
    const accountInfo = roleMap.get(role);
    if (!accountInfo) {
      console.error(`ERROR: No account found for role ${role}`);
      continue;
    }

    const updateRes = await client.query(
      `UPDATE mdata.vendors
       SET default_expense_account_id = $2,
           updated_at = now()
       WHERE operating_company_id = $1
         AND is_sample_data IS NOT TRUE
         AND deactivated_at IS NULL
         AND default_expense_account_id IS NULL
         AND vendor_type = $3
       RETURNING id, name`,
      [USMCA_COMPANY_ID, accountInfo.account_id, vendorType]
    );

    console.log(`\n  ${vendorType} → ${accountInfo.account_number} ${accountInfo.account_name}: ${updateRes.rowCount} rows updated`);
    totalUpdated += updateRes.rowCount ?? 0;
  }

  // Step 4: verify the gap is closed
  const verifyRes = await client.query(
    `SELECT count(*) as remaining_gap
     FROM mdata.vendors
     WHERE operating_company_id = $1
       AND is_sample_data IS NOT TRUE
       AND deactivated_at IS NULL
       AND default_expense_account_id IS NULL`,
    [USMCA_COMPANY_ID]
  );

  console.log(`\nTotal rows updated: ${totalUpdated}`);
  console.log(`Remaining gap (NULL default_expense_account_id): ${verifyRes.rows[0].remaining_gap}`);

  await client.query("COMMIT");
  console.log("\nBackfill complete. Transaction committed.");
}

async function run() {
  try {
    await main();
  } catch (err) {
    console.error("FATAL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

run();
