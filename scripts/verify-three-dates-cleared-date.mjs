#!/usr/bin/env node
/**
 * THREE-DATES-COVERAGE-GAP (owner ruling 2026-09-01, verified against QuickBooks + IRS
 * constructive-payment doctrine). accounting.payments / accounting.bill_payments each carried
 * exactly one date column (payment_date), collapsing "payment issued" (drives GL period,
 * cash-basis recognition, tax year) and "cleared" (drives ONLY which reconciliation session it
 * settles in) into one field. This guard locks the migration adding cleared_date to both tables,
 * and the two bank-feed-driven creation paths that legitimately set issued=cleared at the same
 * moment (categorizing an ALREADY-POSTED bank transaction directly into a bill+payment).
 *
 *   node scripts/verify-three-dates-cleared-date.mjs
 *   node scripts/verify-three-dates-cleared-date.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-three-dates-cleared-date";
const MIGRATION_FILE = "db/migrations/202613310400_three_dates_cleared_date_payments_bill_payments.sql";
const SPLITS_FILE = "apps/backend/src/banking/bank-transaction-splits.service.ts";
const BULK_FILE = "apps/backend/src/banking/bulk-transactions.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(migrationSrc, splitsSrc, bulkSrc) {
  const errs = [];
  if (!migrationSrc) return [`${MIGRATION_FILE}: missing`];

  if (!/ALTER TABLE accounting\.payments ADD COLUMN IF NOT EXISTS cleared_date date/.test(migrationSrc)) {
    errs.push(`${MIGRATION_FILE}: accounting.payments.cleared_date is missing`);
  }
  if (!/ALTER TABLE accounting\.bill_payments ADD COLUMN IF NOT EXISTS cleared_date date/.test(migrationSrc)) {
    errs.push(`${MIGRATION_FILE}: accounting.bill_payments.cleared_date is missing`);
  }
  if (!/BEGIN;[\s\S]*COMMIT;/.test(migrationSrc)) {
    errs.push(`${MIGRATION_FILE}: must run as a single transaction`);
  }

  if (!splitsSrc) errs.push(`${SPLITS_FILE}: missing`);
  else if (!/INSERT INTO accounting\.bill_payments \(\s*\n\s*operating_company_id, bill_id, vendor_id, payment_date, cleared_date,/.test(splitsSrc)) {
    errs.push(`${SPLITS_FILE}: the bank-transaction-split bill_payments insert must set cleared_date alongside payment_date`);
  }

  if (!bulkSrc) errs.push(`${BULK_FILE}: missing`);
  else if (!/payment_date,\s*\n\s*cleared_date,/.test(bulkSrc)) {
    errs.push(`${BULK_FILE}: the bulk-post bill_payments insert must set cleared_date alongside payment_date`);
  }

  return errs;
}

function selftest() {
  const goodMigration = read(MIGRATION_FILE) ?? "";
  const goodSplits = read(SPLITS_FILE) ?? "";
  const goodBulk = read(BULK_FILE) ?? "";
  const goodErrs = assertGuard(goodMigration, goodSplits, goodBulk);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-payments-column-missing", assertGuard(goodMigration.replace("ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS cleared_date date;", ""), goodSplits, goodBulk)],
    ["bad2-bill-payments-column-missing", assertGuard(goodMigration.replace("ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS cleared_date date;", ""), goodSplits, goodBulk)],
    ["bad3-no-transaction", assertGuard(goodMigration.replace("BEGIN;", "-- no txn").replace("COMMIT;", "-- no txn"), goodSplits, goodBulk)],
    ["bad4-splits-not-wired", assertGuard(goodMigration, goodSplits.replace(/payment_date, cleared_date,/g, "payment_date,"), goodBulk)],
    ["bad5-bulk-not-wired", assertGuard(goodMigration, goodSplits, goodBulk.replace(/payment_date,\n            cleared_date,/g, "payment_date,"))],
  ];

  for (const [name, res] of mutations) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${mutations.length}/${mutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(MIGRATION_FILE), read(SPLITS_FILE), read(BULK_FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — accounting.payments/bill_payments carry a distinct cleared_date, and the two bank-feed-driven creation paths set it`);
