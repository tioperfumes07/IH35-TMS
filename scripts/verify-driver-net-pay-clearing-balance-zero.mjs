#!/usr/bin/env node
/**
 * ENG-04 (443.322) — account 2170 Driver Net-Pay Clearing net balance must be zero.
 *
 * ROOT CAUSE: 12 driver advances (CA-2026-0001 to CA-2026-0012, posted 2026-10-11) credited
 * account 2170 instead of the operating bank (1000 BofA). These advances had from_bank_account_id=null,
 * causing the posting engine (pre-fix code) to resolve driver_payroll_clearing (→ 2170) instead of
 * operating_bank (→ 1000). Total misposted: 257,596 cents ($2,575.96).
 *
 * ROUND 326 (owner 2026-10-02): the single clearing JE (Cr 2170) is retired — unreachable. Net pay
 * now posts as a bill payment from the real bank. No new postings should land on 2170. The current
 * advance posting engine correctly resolves operating_bank → 1000. The 12 existing mispostings
 * require a correction JE (owner decision pending).
 *
 * Usage: node scripts/verify-driver-net-pay-clearing-balance-zero.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-driver-net-pay-clearing-balance-zero";
export const REQUIRES_LIVE_DB =
  "catalogs.accounts + accounting.journal_entry_postings — fails closed with no DATABASE_URL";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const NET_PAY_CLEARING_ACCOUNT_NUMBER = "2170";

export function isNonZeroBalance(netCents) {
  return netCents !== 0;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["balance=0 = ok", !isNonZeroBalance(0)],
    ["balance=257596 = violation", isNonZeroBalance(257596)],
    ["balance=-100 = violation", isNonZeroBalance(-100)],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const acctRes = await client.query(
    `SELECT id::text FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND account_number = $2
        AND deactivated_at IS NULL
      LIMIT 1`,
    [USMCA_COMPANY_ID, NET_PAY_CLEARING_ACCOUNT_NUMBER]
  );

  if (acctRes.rows.length === 0) {
    console.log(`${LABEL}: LIVE PASS — account ${NET_PAY_CLEARING_ACCOUNT_NUMBER} not found in USMCA (nothing to check)`);
    await client.query("COMMIT");
    process.exit(0);
  }
  const accountId = acctRes.rows[0].id;

  const balRes = await client.query(
    `SELECT
       jep.source_transaction_type,
       jep.debit_or_credit,
       SUM(jep.amount_cents) AS total_cents,
       COUNT(*) AS cnt
     FROM accounting.journal_entry_postings jep
     WHERE jep.account_id = $1::uuid
       AND jep.operating_company_id = $2::uuid
     GROUP BY jep.source_transaction_type, jep.debit_or_credit
     ORDER BY jep.source_transaction_type, jep.debit_or_credit`,
    [accountId, USMCA_COMPANY_ID]
  );

  await client.query("COMMIT");

  let totalCrCents = 0;
  let totalDrCents = 0;
  for (const row of balRes.rows) {
    if (row.debit_or_credit === "credit") totalCrCents += Number(row.total_cents);
    else totalDrCents += Number(row.total_cents);
  }
  const netCents = totalCrCents - totalDrCents;

  if (isNonZeroBalance(netCents)) {
    console.error(
      `${LABEL}: LIVE FAIL — account 2170 net balance = ${netCents} cents ($${(netCents / 100).toFixed(2)}); expected 0 (ROUND 326 retired the Cr-2170 clearing path)`
    );
    console.error(`  breakdown by source type:`);
    for (const row of balRes.rows) {
      console.error(
        `    ${row.source_transaction_type} ${row.debit_or_credit}: ${row.total_cents} cents (${row.cnt} postings)`
      );
    }
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — account 2170 net balance = 0 (${balRes.rows.length} posting group(s) checked)`
  );
} finally {
  client.release();
  await pool.end();
}
