#!/usr/bin/env node
/**
 * ACCT-F5605 regression guard — recon-engine.service.ts's readTmsBankEntries() must normalize
 * banking.bank_transactions.amount_cents to the QBO side's real convention (credit/money-in
 * positive, debit/money-out negative) using is_credit as the SOLE sign authority, via ABS() --
 * never by trusting the raw stored sign of amount_cents directly.
 *
 * WHY THIS MATTERS: the raw column is NOT a clean magnitude -- is_credit=true rows are stored
 * negative in 96% of cases and positive in a documented 108-row exception (Relay Fuel Wallet).
 * `CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END` (the old, broken form) trusts that
 * stored sign directly, so it returns NEGATIVE for the 96% -- the exact opposite of the QBO side's
 * "credit positive" (recon-cron.service.ts's buildReconEntriesFromQboRegister). Since matchKey()
 * embeds this signed value directly and computeBankCountExceptions sums it, a regression back to the
 * raw-sign form would silently reintroduce false SUM_MISMATCH/REFERENCE_INTEGRITY exceptions on every
 * credit-bearing reconciliation window the moment TMS_QBO_RECON_ENABLED is turned on for any entity.
 *
 * The ABS()-based form is convention-agnostic by construction (correct for both the 96% negative-
 * stored and the 108 positive-stored Relay rows), so this guard asserts ABS() is present on BOTH
 * arms of the CASE, not just checked against a specific row count that would drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recon-engine-sign-convention-abs-is-credit";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/recon/recon-engine.service.ts";

const FIXED_EXPR = "CASE WHEN is_credit THEN ABS(amount_cents) ELSE -ABS(amount_cents) END";

function assertAll(src) {
  const problems = [];
  if (!src.includes(FIXED_EXPR)) {
    problems.push(
      `readTmsBankEntries's CASE expression does not match the required ABS()-based, is_credit-only ` +
        `sign reconstruction ("${FIXED_EXPR}"). Trusting the raw stored sign of amount_cents directly ` +
        `is exactly the LV-BANK-TWO-SIGN-CONVENTIONS regression -- it silently mismatches the QBO ` +
        `side's real "credit positive" convention for 96% of credit rows.`
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  const broken = src.replace(FIXED_EXPR, "CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END");
  const brokenProblems = assertAll(broken);
  if (!brokenProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to the raw-sign CASE expression not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — readTmsBankEntries normalizes via ABS(amount_cents) + is_credit only`);
