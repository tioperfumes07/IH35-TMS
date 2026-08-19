#!/usr/bin/env node
/**
 * ACCT-F5575 regression guard — POST /api/v1/banking/transactions/:id/categorize must verify every
 * caller-supplied catalog/entity id exists and belongs to the caller's company BEFORE writing it
 * onto banking.bank_transactions.categorization_*.
 *
 * The same class of bug as ACCT-F5573 (obligation-reconcile.routes.ts) and ACCT-F5574
 * (reconciliation.routes.ts), at its largest surface: customer_id, vendor_id, driver_id, unit_id,
 * trailer_id, load_id, item_id, class_id, gl_account_id, suggested_match_invoice_id,
 * suggested_match_bill_id were all trusted outright and written straight onto the transaction row.
 * The two consumers that actually MOVE money (bank-feed-gl-posting.service.ts's gl_account_id check,
 * cash-advance-create.ts's driver_id/load_id checks reached via bank-driver-advance.service.ts)
 * already independently re-validate, so this is a data-integrity fix (every OTHER reader of these
 * columns assumes what only the read-time JOIN predicate, not the write, ever enforced) rather than
 * a money-safety one -- but it closes the gap at its source instead of relying on every future
 * consumer to re-derive the same protection.
 *
 * Fix: CATEGORIZE_FIELD_EXISTENCE_SQL, a company-scoped (or existence-only where the catalog has no
 * per-company column) existence query per field, checked inside the same withCompanyScope
 * transaction before the UPDATE, returning `${field}_not_found` -> 404 on any miss. project_id is
 * intentionally excluded (no backing catalog table in this schema).
 *
 * This static check (no DB connection) asserts:
 *   1. CATEGORIZE_FIELD_EXISTENCE_SQL covers all 11 validatable fields with a company-scoped (or
 *      documented existence-only) query each.
 *   2. The categorize handler actually loops CATEGORIZE_FIELD_EXISTENCE_SQL and returns a
 *      `${field}_not_found` 404 before the UPDATE that writes categorization_*.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:categorize-field-existence-checked";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/banking/categorization.routes.ts";

const FIELDS = [
  "customer_id",
  "vendor_id",
  "driver_id",
  "unit_id",
  "trailer_id",
  "load_id",
  "item_id",
  "class_id",
  "gl_account_id",
  "suggested_match_invoice_id",
  "suggested_match_bill_id",
];

function assertAll(src) {
  const problems = [];

  for (const f of FIELDS) {
    const re = new RegExp(`${f}:\\s*\`SELECT 1 FROM [\\w.]+ WHERE id = \\$1::uuid AND `);
    if (!re.test(src)) {
      problems.push(`CATEGORIZE_FIELD_EXISTENCE_SQL missing an existence query for "${f}"`);
    }
  }

  if (!/for \(const \[field, sql\] of Object\.entries\(CATEGORIZE_FIELD_EXISTENCE_SQL\)\) \{/.test(src)) {
    problems.push(`categorize handler no longer loops CATEGORIZE_FIELD_EXISTENCE_SQL`);
  }
  if (!/return \{ code: 404 as const, error: `\$\{field\}_not_found` \};/.test(src)) {
    problems.push(`categorize handler no longer returns a per-field 404 on a missing/foreign id`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  // Plant defect 1: drop one field's existence query (simulate a field regressing back to trusted).
  const planted1 = src.replace(
    /  gl_account_id: `SELECT 1 FROM catalogs\.accounts WHERE id = \$1::uuid AND operating_company_id = \$2::uuid`,\n/,
    "",
  );
  if (planted1 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 1 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted1).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 1 (dropped gl_account_id existence query) not caught`);
    process.exit(1);
  }

  // Plant defect 2: drop the loop + 404 entirely (regress to trusting every field).
  const planted2 = src.replace(
    /\n\s*\/\/ ACCT-F5575: reject before writing[\s\S]*?return \{ code: 404 as const, error: `\$\{field\}_not_found` \};\s*\n\s*\}\s*\n\s*\}\s*\n/,
    "\n",
  );
  if (planted2 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 2 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted2).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 2 (dropped the whole existence-check loop) not caught`);
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
console.log(`${LABEL} OK`);
