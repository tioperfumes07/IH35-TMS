#!/usr/bin/env node
// GAP45-OPERATING-BALANCE-READS-STALE-RAW-COLUMN-FOR-NON-PLAID-WALLET -- guard
//
// /reports/cash-flow (GAP-45 "Tenant-scoped liquidity snapshot") used to compute
// operating_balance_cents as a plain SUM(current_balance_cents) FROM banking.bank_accounts.
// That raw column is ONLY ever written by the Plaid webhook path (internal-wallet-balance.ts) --
// any non-Plaid internal wallet (Relay Fuel Wallet, plaid_item_id IS NULL) is never kept in sync
// there, so the column holds a stale/wrong value with no relation to the wallet's real ledger.
// Verified live prod (br-fancy-credit-akjnd07a, USMCA): raw column read -$543.45 for a wallet
// whose actual ledger-derived balance is +$1,200.00 -- a $1,743.45 swing on reported liquidity
// ($750.23 reported vs. $2,493.68 correct, matching every other authoritative cash surface).
//
// Fix: reuse the existing authoritative helper (sumAuthoritativeDepositoryCashCents, already the
// source of truth for cash-flow opening balance, the KPI aggregate, and account tiles) instead of
// re-deriving a raw SUM. This guard fails if the route reverts to a raw current_balance_cents SUM
// or drops the authoritative-helper call.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/reports/cash-flow/route-fix.ts";

export function check(text) {
  const failures = [];
  if (!/import\s*\{\s*sumAuthoritativeDepositoryCashCents\s*\}\s*from\s*"\.\.\/\.\.\/banking\/internal-wallet-balance\.js"/.test(text)) {
    failures.push(`${FILE}: no longer imports sumAuthoritativeDepositoryCashCents from internal-wallet-balance.js`);
  }
  if (!/await sumAuthoritativeDepositoryCashCents\(client, companyId, \{/.test(text)) {
    failures.push(`${FILE}: operating_balance_cents no longer derived via sumAuthoritativeDepositoryCashCents(...)`);
  }
  // The specific regression this guard exists to catch: a raw SUM(current_balance_cents) directly
  // off banking.bank_accounts, bypassing the internal-wallet ledger-derived override entirely.
  if (/SELECT COALESCE\(SUM\(current_balance_cents\), 0\)::text AS total_cents\s*\n\s*FROM banking\.bank_accounts/.test(text)) {
    failures.push(`${FILE}: operating_balance_cents is computed via a raw SUM(current_balance_cents) FROM banking.bank_accounts -- this bypasses the internal-wallet ledger-derived override and undercounts any non-Plaid wallet`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: gap45-cash-flow-operating-balance-authoritative-source");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: /reports/cash-flow (GAP-45) derives operating_balance_cents via the authoritative depository-cash helper");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text
    .replace(
      /import \{ sumAuthoritativeDepositoryCashCents \} from "\.\.\/\.\.\/banking\/internal-wallet-balance\.js";\n/,
      "",
    )
    .replace(
      /const operatingBalanceCents = await sumAuthoritativeDepositoryCashCents\(client, companyId, \{\s*\n\s*hideFilterOnBankAccounts: bankAccountHiddenFilterSql\(hideOn, "banking\.bank_accounts"\),\s*\n\s*hideFilterOnBaAlias: bankAccountHiddenFilterSql\(hideOn, "ba"\),\s*\n\s*\}\);/,
      `const bankRes = await client.query(
        \`
          SELECT COALESCE(SUM(current_balance_cents), 0)::text AS total_cents
          FROM banking.bank_accounts
          WHERE operating_company_id = $1::uuid
            AND is_active = true
          \${bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts")}
        \`,
        [companyId]
      );
      const operatingBalanceCents = Number(bankRes.rows[0]?.total_cents ?? 0);`,
    );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to raw current_balance_cents SUM) was NOT caught");
    process.exit(1);
  }
  const baselineFailures = check(text);
  if (baselineFailures.length > 0) {
    console.error("FAIL(selftest): baseline (unmodified) source unexpectedly fails check()");
    for (const f of baselineFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS(selftest): planted offender correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
