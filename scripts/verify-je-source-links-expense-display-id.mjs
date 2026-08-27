#!/usr/bin/env node
/**
 * JE-SOURCE-LINKS-EXPENSE-NEVER-JOINED (live-reproduced 2026-08-27, GO-1722 accounting walk)
 *
 * Live-reproduced: created a real TEST expense (EXP-2026-00002) through the app, opened its GL
 * posting's Journal Entry detail page, and the "Source links" panel rendered the honest-but-avoidable
 * "Source — not visible" tombstone for the row's own EXPENSE source, even though the expense exists,
 * posted correctly, and its display id (expense_number) renders fine everywhere else (expense list,
 * the JE's own memo, the LIST view's JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL a few lines above in the
 * same file). getJournalEntrySourceLinks (backing the JE DETAIL page's reverse-link panel) never had a
 * join for source_transaction_type/linked_object_type = 'expense' at all — the exact same class of gap
 * already fixed in this function for invoice, bill, bank_categorization, fuel_event and
 * driver_reimbursement (see the LV-JE-SOURCE-LINKS-INVOICE-NOT-VISIBLE / JE-SOURCE-LINKS-BILL-USES-
 * WRONG-COLUMN comments immediately above it), just never extended to expense.
 *
 * This guard locks: both COALESCE chains (source_transaction_display_id, linked_object_display_id)
 * include an expense-resolving term, and a LEFT JOIN exists for each side keyed on
 * accounting.expenses.id, scoped by operating_company_id, gated on the 'expense' type string.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/accounting/journal-entries.service.ts";

export function check(src) {
  const failures = [];

  // Isolate getJournalEntrySourceLinks's body so this guard cannot be satisfied by an unrelated
  // 'expense' reference elsewhere in the file (e.g. the JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL used by
  // listJournalEntries, which already resolves expense correctly and is not what this guard checks).
  const fnStart = src.indexOf("export async function getJournalEntrySourceLinks(");
  if (fnStart === -1) {
    failures.push(`${FILE}: getJournalEntrySourceLinks not found`);
    return failures;
  }
  const nextFn = src.indexOf("\nexport async function ", fnStart + 1);
  const body = nextFn === -1 ? src.slice(fnStart) : src.slice(fnStart, nextFn);

  if (!/COALESCE\([^)]*src_expense\.display_label[^)]*\) AS source_transaction_display_id/.test(body)) {
    failures.push(
      `${FILE}: source_transaction_display_id's COALESCE no longer resolves an expense source ` +
        `(src_expense.display_label missing) — expense-sourced JEs will tombstone "Source — not visible" again`
    );
  }
  if (!/COALESCE\([^)]*link_expense\.display_label[^)]*\) AS linked_object_display_id/.test(body)) {
    failures.push(
      `${FILE}: linked_object_display_id's COALESCE no longer resolves an expense-linked object ` +
        `(link_expense.display_label missing)`
    );
  }
  if (!/WHERE\s+jep\.source_transaction_type = 'expense'\s+AND\s+e\.id::text = jep\.source_transaction_id\s+AND\s+e\.operating_company_id = \$2::uuid/.test(body)) {
    failures.push(`${FILE}: the src_expense join is missing, mis-scoped, or no longer keyed on jep.source_transaction_id`);
  }
  if (!/WHERE\s+tsl\.linked_object_type = 'expense'\s+AND\s+e2\.id::text = tsl\.linked_object_id\s+AND\s+e2\.operating_company_id = \$2::uuid/.test(body)) {
    failures.push(`${FILE}: the link_expense join is missing, mis-scoped, or no longer keyed on tsl.linked_object_id`);
  }
  if (!/FROM accounting\.expenses e\b/.test(body) || !/FROM accounting\.expenses e2\b/.test(body)) {
    failures.push(`${FILE}: expected both an 'e' and an 'e2' accounting.expenses join alias in getJournalEntrySourceLinks`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: je-source-links-expense-display-id");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: getJournalEntrySourceLinks resolves a real display id for expense-sourced/linked postings " +
      "(source_transaction_type/linked_object_type = 'expense'), scoped and keyed correctly"
  );
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: drop src_expense from the source_transaction_display_id COALESCE (the exact pre-fix
  // shape — this term never existed there at all).
  const offenderA = src.replace(", src_expense.display_label) AS source_transaction_display_id", ") AS source_transaction_display_id");
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (COALESCE term dropped) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: remove the whole src_expense LEFT JOIN LATERAL block (regression via join deletion,
  // not just the COALESCE reference).
  const offenderB = src.replace(
    /LEFT JOIN LATERAL \(\s*SELECT COALESCE\(NULLIF\(e\.expense_number[\s\S]*?\) src_expense ON true\n/,
    ""
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (src_expense join deleted) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: weaken the join's company scope (drop the operating_company_id guard) — a real
  // cross-entity leak, not just a missing feature.
  const offenderC = src.replace(
    "AND e.id::text = jep.source_transaction_id\n            AND e.operating_company_id = $2::uuid",
    "AND e.id::text = jep.source_transaction_id"
  );
  if (offenderC === src) {
    console.error("FAIL(selftest): offender C mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (company-scope dropped from src_expense join) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
