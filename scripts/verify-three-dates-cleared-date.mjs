#!/usr/bin/env node
/**
 * THREE-DATES-COVERAGE-GAP (owner ruling 2026-09-01, verified against QuickBooks + IRS
 * constructive-payment doctrine). accounting.payments / accounting.bill_payments each carried
 * exactly one date column (payment_date), collapsing "payment issued" (drives GL period,
 * cash-basis recognition, tax year) and "cleared" (drives ONLY which reconciliation session it
 * settles in) into one field. This guard locks the migration adding cleared_date to both tables,
 * the two bank-feed-driven creation paths that legitimately set issued=cleared at the same moment
 * (categorizing an ALREADY-POSTED bank transaction directly into a bill+payment), and — BANK-F26053
 * (2026-09-08) — the general reconciliation match-accept/unmatch flow: a payment/bill_payment
 * created BEFORE its bank transaction cleared (payment_date set, cleared_date still NULL) must get
 * cleared_date stamped the moment it's matched to a bank transaction, and cleared back to NULL if
 * that match is later undone (unmatching detaches it from the reconciliation session it settled
 * in). The migration's own column comment says exactly this: "Nullable until a matching bank
 * transaction clears it" — this guard is what makes that true instead of aspirational.
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
const MATCH_FILE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const WORKLIST_FILE = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(migrationSrc, splitsSrc, bulkSrc, matchSrc, worklistSrc) {
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

  if (!matchSrc) errs.push(`${MATCH_FILE}: missing`);
  else {
    if (!/UPDATE accounting\.payments\s*\n\s*SET source_bank_transaction_id = COALESCE\(source_bank_transaction_id, \$1::uuid\),\s*\n\s*cleared_date = COALESCE\(cleared_date, \$4::date\)/.test(matchSrc)) {
      errs.push(`${MATCH_FILE}: the reconciliation match-accept UPDATE on accounting.payments must stamp cleared_date = COALESCE(cleared_date, <bank txn date>) alongside source_bank_transaction_id`);
    }
    if (!/UPDATE accounting\.bill_payments\s*\n\s*SET source_bank_transaction_id = COALESCE\(source_bank_transaction_id, \$1::uuid\),\s*\n\s*from_bank_account_id = COALESCE\(from_bank_account_id, \$4::uuid\),\s*\n\s*cleared_date = COALESCE\(cleared_date, \$5::date\)/.test(matchSrc)) {
      errs.push(`${MATCH_FILE}: the reconciliation match-accept UPDATE on accounting.bill_payments must stamp cleared_date = COALESCE(cleared_date, <bank txn date>) alongside source_bank_transaction_id/from_bank_account_id`);
    }
  }

  if (!worklistSrc) errs.push(`${WORKLIST_FILE}: missing`);
  else {
    if (!/UPDATE accounting\.payments\s*\n\s*SET source_bank_transaction_id = NULL,\s*\n\s*cleared_date = NULL/.test(worklistSrc)) {
      errs.push(`${WORKLIST_FILE}: unmatching a bank transaction must also clear accounting.payments.cleared_date back to NULL (a payment no longer settles in the session it was ticked into)`);
    }
    if (!/UPDATE accounting\.bill_payments\s*\n\s*SET source_bank_transaction_id = NULL,\s*\n\s*from_bank_account_id = NULL,\s*\n\s*cleared_date = NULL/.test(worklistSrc)) {
      errs.push(`${WORKLIST_FILE}: unmatching a bank transaction must also clear accounting.bill_payments.cleared_date back to NULL`);
    }
  }

  return errs;
}

function selftest() {
  const goodMigration = read(MIGRATION_FILE) ?? "";
  const goodSplits = read(SPLITS_FILE) ?? "";
  const goodBulk = read(BULK_FILE) ?? "";
  const goodMatch = read(MATCH_FILE) ?? "";
  const goodWorklist = read(WORKLIST_FILE) ?? "";
  const goodErrs = assertGuard(goodMigration, goodSplits, goodBulk, goodMatch, goodWorklist);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-payments-column-missing", assertGuard(goodMigration.replace("ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS cleared_date date;", ""), goodSplits, goodBulk, goodMatch, goodWorklist)],
    ["bad2-bill-payments-column-missing", assertGuard(goodMigration.replace("ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS cleared_date date;", ""), goodSplits, goodBulk, goodMatch, goodWorklist)],
    ["bad3-no-transaction", assertGuard(goodMigration.replace("BEGIN;", "-- no txn").replace("COMMIT;", "-- no txn"), goodSplits, goodBulk, goodMatch, goodWorklist)],
    ["bad4-splits-not-wired", assertGuard(goodMigration, goodSplits.replace(/payment_date, cleared_date,/g, "payment_date,"), goodBulk, goodMatch, goodWorklist)],
    ["bad5-bulk-not-wired", assertGuard(goodMigration, goodSplits, goodBulk.replace(/payment_date,\n            cleared_date,/g, "payment_date,"), goodMatch, goodWorklist)],
    ["bad6-match-payment-not-wired", assertGuard(goodMigration, goodSplits, goodBulk, goodMatch.replace("cleared_date = COALESCE(cleared_date, $4::date)\n          WHERE id = $2::uuid\n            AND operating_company_id = $3::uuid`,\n        [\n          input.bank_transaction_id,\n          input.ledger_entry_id,\n          input.operating_company_id,\n          txn.transaction_date.slice(0, 10),\n        ]", "WHERE id = $2::uuid\n            AND operating_company_id = $3::uuid`,\n        [input.bank_transaction_id, input.ledger_entry_id, input.operating_company_id]"), goodWorklist)],
    ["bad7-match-bill-payment-not-wired", assertGuard(goodMigration, goodSplits, goodBulk, goodMatch.replace(",\n                cleared_date = COALESCE(cleared_date, $5::date),\n                updated_at = now()", ",\n                updated_at = now()"), goodWorklist)],
    ["bad8-unmatch-payment-not-cleared", assertGuard(goodMigration, goodSplits, goodBulk, goodMatch, goodWorklist.replace("SET source_bank_transaction_id = NULL,\n                cleared_date = NULL\n          WHERE id = $1::uuid", "SET source_bank_transaction_id = NULL\n          WHERE id = $1::uuid"))],
    ["bad9-unmatch-bill-payment-not-cleared", assertGuard(goodMigration, goodSplits, goodBulk, goodMatch, goodWorklist.replace("from_bank_account_id = NULL,\n                cleared_date = NULL,\n                updated_at = now()", "from_bank_account_id = NULL,\n                updated_at = now()"))],
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

const errs = assertGuard(read(MIGRATION_FILE), read(SPLITS_FILE), read(BULK_FILE), read(MATCH_FILE), read(WORKLIST_FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — accounting.payments/bill_payments carry a distinct cleared_date; the two bank-feed-driven creation paths, the reconciliation match-accept path, and the unmatch path all set/clear it correctly`);
