#!/usr/bin/env node
// ROUND 181, Step 3 — Account pollution report (read-only).
//
// 22 real drivers vs 41 escrow and 47 advance sub-accounts.
// For each account, report: postings count, balance, safe to deactivate?
//
// Never delete. Deactivate only, through the Lead's AUTH.
//
// Usage: node scripts/ops/2026-09-25-devin-b-account-pollution-report.mjs

import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "account-pollution-report";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

    // 1. Get all driver sub-accounts (children of 1245 and 2100)
    const accountsRes = await client.query(
      `SELECT a.id::text, a.account_number, a.account_name, a.account_type,
              p.account_number AS parent_number, p.account_name AS parent_name,
              a.deactivated_at IS NOT NULL AS deactivated,
              a.is_sample_data
         FROM catalogs.accounts a
         LEFT JOIN catalogs.accounts p ON p.id = a.parent_account_id
        WHERE a.operating_company_id = $1::uuid
          AND a.parent_account_id IN (
            SELECT id FROM catalogs.accounts
             WHERE operating_company_id = $1::uuid
               AND account_number IN ('1245', '2100')
               AND parent_account_id IS NULL
          )
        ORDER BY p.account_number, a.account_number`,
      [USMCA_COMPANY_ID],
    );

    // 2. Get postings count and balance per account
    const accounts = [];
    for (const a of accountsRes.rows) {
      const postingsRes = await client.query(
        `SELECT count(*)::int AS postings,
                COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
           FROM accounting.journal_entry_postings jep
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
          WHERE jep.account_id = $1::uuid
            AND je.operating_company_id = $2::uuid
            AND je.voided_at IS NULL`,
        [a.id, USMCA_COMPANY_ID],
      );

      const postings = postingsRes.rows[0].postings;
      const balanceCents = Number(postingsRes.rows[0].balance_cents);
      const safeToDeactivate = postings === 0 && balanceCents === 0 && !a.deactivated;

      accounts.push({
        ...a,
        postings,
        balanceCents,
        safeToDeactivate,
      });
    }

    // 3. Print the report
    console.log(`${LABEL}: driver sub-account pollution report (USMCA)`);
    console.log("");

    // Group by parent
    const advanceAccounts = accounts.filter(a => a.parent_number === "1245");
    const escrowAccounts = accounts.filter(a => a.parent_number === "2100");

    console.log(`=== Driver Cash Advances Receivable (1245) — ${advanceAccounts.length} sub-accounts ===`);
    console.log("");
    console.log("  Account Number                    Account Name                                      Posts  Balance       Deactivated  Safe to Deactivate");
    console.log("  " + "-".repeat(120));
    for (const a of advanceAccounts) {
      console.log(`  ${(a.account_number || "NULL").padEnd(34)} ${a.account_name.padEnd(48)} ${String(a.postings).padStart(4)}   $${(a.balanceCents / 100).toFixed(2).padStart(12)}  ${a.deactivated ? "YES" : "NO"}         ${a.safeToDeactivate ? "YES" : "NO"}`);
    }

    console.log("");
    console.log(`=== Driver Escrow - Held in Trust (2100) — ${escrowAccounts.length} sub-accounts ===`);
    console.log("");
    console.log("  Account Number                    Account Name                                      Posts  Balance       Deactivated  Safe to Deactivate");
    console.log("  " + "-".repeat(120));
    for (const a of escrowAccounts) {
      console.log(`  ${(a.account_number || "NULL").padEnd(34)} ${a.account_name.padEnd(48)} ${String(a.postings).padStart(4)}   $${(a.balanceCents / 100).toFixed(2).padStart(12)}  ${a.deactivated ? "YES" : "NO"}         ${a.safeToDeactivate ? "YES" : "NO"}`);
    }

    // 4. Summary
    console.log("");
    console.log("=== SUMMARY ===");
    console.log(`  Total advance sub-accounts: ${advanceAccounts.length}`);
    console.log(`  Total escrow sub-accounts:  ${escrowAccounts.length}`);
    console.log(`  Total:                      ${accounts.length}`);
    console.log(`  Safe to deactivate:         ${accounts.filter(a => a.safeToDeactivate).length}`);
    console.log(`  Already deactivated:        ${accounts.filter(a => a.deactivated).length}`);
    console.log(`  With postings:              ${accounts.filter(a => a.postings > 0).length}`);
    console.log(`  With non-zero balance:      ${accounts.filter(a => a.balanceCents !== 0).length}`);

    // 5. List test/sample rows
    console.log("");
    console.log("=== TEST/SAMPLE ACCOUNTS (candidates for deactivation) ===");
    const testAccounts = accounts.filter(a => {
      const name = a.account_name.toUpperCase();
      return name.includes("TEST") || name.includes("SAMPLE") || name.includes("CODEX") ||
             name.includes("ZZTEST") || name.includes("CC3") || name.includes("AUDIT") ||
             name.includes("AUTOACCT") || name.includes("FLEET TEST") || name.includes("SAFETY");
    });
    for (const a of testAccounts) {
      console.log(`  ${(a.account_number || "NULL").padEnd(34)} ${a.account_name.padEnd(48)} posts=${a.postings} bal=$${(a.balanceCents / 100).toFixed(2)} safe=${a.safeToDeactivate}`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

main();
