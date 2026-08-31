#!/usr/bin/env node
/**
 * GUARD (ratchet): a NEW money-document create path must name is_sample_data. ACCT-F208.
 *
 * WHAT SHIPPED AND WHAT DID NOT. Migration 202612370000 added is_sample_data to seven money tables so
 * that "is this row real money?" is a STRUCTURED question rather than a LIKE '%SAMPLE%' guess. Its own
 * header said what it deliberately left undone: "it does not tag anything. Deriving the value on write
 * ... is application work and ships with its guard."
 *
 * THAT APPLICATION WORK WAS NEVER FINISHED, and prod shows the cost. The column exists on all seven
 * tables and ZERO rows anywhere are tagged, while TWELVE rows carry the Gate-B sample marker in their
 * own free text and say is_sample_data = false:
 *   accounting.invoices        4   (all invoice_type='manual')
 *   accounting.expenses        3
 *   accounting.journal_entries 3
 *   accounting.bill_payments   2
 * The memo says SAMPLE and the boolean says REAL. At go-live, "exclude sample rows from this report"
 * is a query on the boolean — so every one of those sample documents counts as real money.
 *
 * WHY A RATCHET AND NOT A FIX. The load-derived paths are already correct: from-load.ts tags invoices
 * (ACCT-F193) and settlements-load-bookended.service.ts tags settlement lines, both deriving from the
 * load — one source of truth. The untagged paths are the manual/direct creates, and wiring each of
 * them is a genuine behaviour change that needs the CALLER to supply the value; done carelessly it
 * would either tag nothing (no better) or tag by string-matching a memo (exactly what the column
 * replaced). So the existing offenders are frozen and boarded, and this guard's job is narrower and
 * absolute: NO NEW money-create path may forget the column.
 *
 * THE QBO PULLER IS EXEMPT ON PURPOSE. Imported QBO rows are real books, not samples — 27,070 of the
 * 27,075 expenses on prod are QBO clones. Requiring the tag there would invite someone to set it, which
 * would mislabel real financial history as test data. That is a worse defect than the one being fixed.
 *
 * RATCHET, NOT AMNESTY: never add an entry to make a build green. Removing entries as each path is
 * wired is the intended direction, and the count below should only ever fall.
 *
 * Run:  node scripts/verify-money-create-tags-sample-data.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-money-create-tags-sample-data";

/** The money tables that carry is_sample_data on prod (migration 202612370000), verified 2026-08-08. */
export const SAMPLE_TAGGED_TABLES = [
  // ACCT-F220 — MASTER DATA belongs in this ratchet too. Five customers/vendors reached prod untagged
  // because their create routes never named the column, while the loads and invoices hanging off them
  // tagged perfectly. A sample invoice pointing at a "real" customer is still an unanswerable report.
  "mdata.customers",
  "mdata.vendors",
  "accounting.bills",
  "accounting.invoices",
  "accounting.payments",
  "accounting.bill_payments",
  "accounting.journal_entries",
  "accounting.expenses",
  "driver_finance.settlement_lines",
];

/**
 * FROZEN BASELINE — create paths that exist today WITHOUT the tag. Each is boarded.
 * The QBO pullers are absent by design: imported rows are real books and must never be tagged sample.
 */
const BASELINE = new Set([
  // ACCT-F220 — the driver->vendor auto-link mirror. It creates a vendor row FOR a driver, so its
  // flag should derive from that driver rather than from a request body, and the driver row is not
  // in scope at this INSERT. Baselined deliberately rather than hardcoded false, which would look
  // fixed and would not be.
  "apps/backend/src/accounting/driver-vendor-link.service.ts::mdata.vendors",
  "apps/backend/src/mdata/vendors.routes.ts::mdata.vendors",
  "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts::accounting.journal_entries",
  "apps/backend/src/accounting/bank-recon/match.service.ts::accounting.journal_entries",
  "apps/backend/src/accounting/bills-bulk.routes.ts::accounting.bill_payments",
  "apps/backend/src/accounting/bills.service.ts::accounting.bill_payments",
  "apps/backend/src/accounting/bills.service.ts::accounting.bills",
  "apps/backend/src/accounting/customer-payments.routes.ts::accounting.payments",
  "apps/backend/src/accounting/expenses.routes.ts::accounting.expenses",
  "apps/backend/src/accounting/fuel-posting/poster.service.ts::accounting.journal_entries",
  "apps/backend/src/accounting/invoices.routes.ts::accounting.invoices",
  "apps/backend/src/accounting/invoices.service.ts::accounting.invoices",
  "apps/backend/src/accounting/lease-asc842/lease-posting.service.ts::accounting.journal_entries",
  "apps/backend/src/accounting/maintenance-posting/poster.service.ts::accounting.bills",
  "apps/backend/src/accounting/payments.routes.ts::accounting.payments",
  "apps/backend/src/accounting/period-close-retained-earnings.service.ts::accounting.journal_entries",
  "apps/backend/src/accounting/recurring.worker.ts::accounting.bills",
  "apps/backend/src/accounting/recurring.worker.ts::accounting.expenses",
  "apps/backend/src/accounting/recurring.worker.ts::accounting.invoices",
  "apps/backend/src/accounting/recurring.worker.ts::accounting.journal_entries",
  "apps/backend/src/accounting/vendor-bill-payments.routes.ts::accounting.bill_payments",
  "apps/backend/src/accounting/void.service.ts::accounting.journal_entries",
  "apps/backend/src/ap/payment-application.routes.ts::accounting.bill_payments",
  "apps/backend/src/banking/bank-transaction-splits.service.ts::accounting.bill_payments",
  "apps/backend/src/banking/bank-transaction-splits.service.ts::accounting.bills",
  "apps/backend/src/banking/bulk-transactions.ts::accounting.bill_payments",
  "apps/backend/src/banking/bulk-transactions.ts::accounting.bills",
  "apps/backend/src/banking/manual-je.routes.deprecated.ts::accounting.journal_entries",
  "apps/backend/src/bill-payments/cc-payment.routes.ts::accounting.bill_payments",
  "apps/backend/src/cash-advances/cash-advances.routes.ts::accounting.bill_payments",
  "apps/backend/src/cash-advances/lumper-cash-advance-split.ts::accounting.bill_payments",
  "apps/backend/src/cash-advances/lumper-cash-advance-split.ts::accounting.expenses",
  "apps/backend/src/driver-finance/abandonment.service.ts::driver_finance.settlement_lines",
  "apps/backend/src/driver-finance/settlement-contract-terms.service.ts::driver_finance.settlement_lines",
  "apps/backend/src/driver-finance/settlement-deduction-cap.service.ts::driver_finance.settlement_lines",
  "apps/backend/src/driver-finance/settlements-mvp.routes.ts::driver_finance.settlement_lines",
  "apps/backend/src/driver-finance/settlements.routes.ts::driver_finance.settlement_lines",
  "apps/backend/src/driver-finance/weekly-close.routes.ts::driver_finance.settlement_lines",
  "apps/backend/src/insurance/policy-create-atomic.service.ts::accounting.bills",
  "apps/backend/src/maintenance/two-section-service.ts::accounting.expenses",
  "apps/backend/src/settlements/disputes/disputes.routes.ts::driver_finance.settlement_lines",
  "apps/backend/src/settlements/team-splits/apply.ts::driver_finance.settlement_lines",
]);

/**
 * Paths this ratchet does not police, for two DIFFERENT reasons:
 *
 *  1. IMPORTS OF REAL BOOKS — QBO pullers and CSV seed imports. 27,070 of the 27,075 expenses on prod
 *     are QBO clones; requiring the tag there would invite someone to SET it, mislabelling real
 *     financial history as test data. That is a worse defect than the one being fixed.
 *  2. PATHS THAT ALREADY MANAGE THE FLAG THEMSELVES — onboarding/seed-sample-data.ts INSERTs and then
 *     runs `SET is_sample_data = true` on what it created. It is the sample seeder; demanding the
 *     column in its INSERT column-list would be flagging the one file that is already correct.
 */
export function isImportPath(file) {
  return /qbo-sync\/|qbo-.*-puller|\/seed\/|csv-seed-import|seed-sample-data/.test(file);
}

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Tables this source INSERTs into without naming is_sample_data in the column list. */
export function untaggedInserts(src, tables = SAMPLE_TAGGED_TABLES) {
  const clean = stripComments(src);
  const out = [];
  for (const table of tables) {
    const re = new RegExp(
      `INSERT\\s+INTO\\s+${table.replace(".", "\\.")}\\s*\\(([\\s\\S]{0,3000}?)\\)\\s*(?:VALUES|SELECT)`,
      "gi"
    );
    let m;
    while ((m = re.exec(clean)) !== null) {
      const columnList = m[1];
      if (/\bis_sample_data\b/i.test(columnList)) continue;
      // DYNAMIC COLUMN LISTS. Several routes build their INSERT as `(${columns.join(", ")})` and add
      // fields through an addOptional() helper, so the literal never contains any column name at all.
      // Reading that as "untagged" is a FALSE POSITIVE — it flags the correct code and, worse, teaches
      // the next person that the guard is noise. If the list is interpolated, fall back to asking
      // whether this file writes the column anywhere.
      const isDynamic = /\$\{/.test(columnList);
      // The fallback must find evidence of a WRITE, not a mention. An earlier version accepted any
      // occurrence of the identifier — and a mutation proved that false-green: deleting the actual
      // addOptional() call still passed, because the zod SCHEMA still names the field. A schema
      // declaring a column is not the same as an INSERT writing it.
      const writesDynamically =
        /addOptional\s*\(\s*["'`]is_sample_data["'`]/.test(clean) ||
        /columns\.push\s*\(\s*["'`]is_sample_data["'`]/.test(clean);
      if (isDynamic && writesDynamically) continue;
      out.push(table);
    }
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

export function collectProblems(sources, baseline = BASELINE) {
  const problems = [];
  for (const { file, src } of sources) {
    if (isImportPath(file)) continue;
    for (const table of untaggedInserts(src)) {
      if (baseline.has(`${file}::${table}`)) continue;
      problems.push(
        `${file} INSERTs into ${table} without naming is_sample_data. That column is how a report ` +
          `answers "is this real money?" — a row created without it is indistinguishable from real ` +
          `financial data, no matter what its memo says. Prod already holds 12 such rows whose own ` +
          `free text says SAMPLE while the boolean says false (ACCT-F208).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const T = ["accounting.invoices"];

  const bad = "INSERT INTO accounting.invoices (id, customer_id) VALUES ($1,$2)";
  const good = "INSERT INTO accounting.invoices (id, customer_id, is_sample_data) VALUES ($1,$2,$3)";
  const badSelect = "INSERT INTO accounting.invoices (id, customer_id) SELECT $1,$2";
  const goodSelect = "INSERT INTO accounting.invoices (id, customer_id, is_sample_data) SELECT $1,$2,$3";
  if (untaggedInserts(bad, T).length !== 1) failures.push("an untagged INSERT was NOT caught");
  if (untaggedInserts(good, T).length !== 0) failures.push("a tagged INSERT was flagged");
  if (untaggedInserts(badSelect, T).length !== 1) failures.push("an untagged INSERT SELECT was NOT caught");
  if (untaggedInserts(goodSelect, T).length !== 0) failures.push("a tagged INSERT SELECT was flagged");

  // A comment naming the column must not satisfy the check.
  const commentOnly = "-- is_sample_data derived from the load\n" + bad;
  if (untaggedInserts(commentOnly, T).length !== 1) {
    failures.push("a COMMENT naming the column satisfied the check — false green");
  }

  // Import paths are exempt: tagging real QBO books as sample is a WORSE defect.
  if (collectProblems([{ file: "apps/backend/src/qbo-sync/qbo-ar-invoices-puller.ts", src: bad }], new Set()).length !== 0) {
    failures.push("a QBO import path was flagged — that would invite mislabelling real books");
  }
  if (collectProblems([{ file: "apps/backend/src/seed/csv-seed-import.ts", src: bad }], new Set()).length !== 0) {
    failures.push("a seed import path was flagged");
  }

  // Ratchet: NEW offender fails, baselined one passes.
  const newOffender = [{ file: "apps/backend/src/accounting/brand-new.ts", src: bad }];
  if (collectProblems(newOffender, new Set()).length !== 1) failures.push("a NEW offender was not caught");
  if (collectProblems(newOffender, new Set(["apps/backend/src/accounting/brand-new.ts::accounting.invoices"])).length !== 0) {
    failures.push("a baselined offender was still reported");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 7/7 (untagged caught, tagged passes, comment cannot fake a pass, QBO and ` +
      `seed imports exempt, ratchet catches NEW and honours baseline)`
  );
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} NEW money-create path(s) missing is_sample_data:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — no NEW money-document create path omits is_sample_data across the ` +
    `${SAMPLE_TAGGED_TABLES.length} tagged tables (${BASELINE.size} known paths baselined and boarded).`
);
