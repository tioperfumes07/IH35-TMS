#!/usr/bin/env node
/**
 * FINDING: LV-BILLPAY-CREATE-JE-NOT-VISIBLE (carries ACCT-F5397) — found live 2026-08-16 while
 * performing the assigned accounting Wave A2 live-verify of the `bill_payments.create` leaf. Selecting
 * an unpaid USMCA bill in the "Record Bill Payment" flow showed "Journal entry — not visible" for a
 * bill whose posting JE was real, dated, and independently drillable (the SAME bill's own Bill Detail
 * page correctly showed the JE date + memo).
 *
 * ROOT CAUSE: listAllBillsForCompany() / listBillsByVendor() in
 * apps/backend/src/accounting/bills.service.ts (backing GET /api/v1/accounting/bills, which feeds
 * BillDetailPanel via the bill-payment "unpaid bill selector" AND BillsPage's own list rows) selected
 * BILL_JOURNAL_ENTRY_ID_SQL (the JE uuid) but never resolved the JE's own entry_date/memo —
 * getBillDetail (the single-bill endpoint) already joined accounting.journal_entries and never had
 * this gap. entityLabel() falls back to "Journal entry — not visible" whenever both name and date are
 * absent, which is the correct FALLBACK behavior for a truly-absent JE, but was firing here for a real
 * one. Live-measured: 0 of ~30 posted USMCA bills carried a resolvable JE date/memo from the LIST
 * endpoint pre-fix; the same live query confirmed every one resolves cleanly (e.g. bill
 * 8c199b5f-d805-4b76-a8a9-8ee758f189de → "2026-08-11 — Bill P38-FK-SMOKE-1786483495081 posting").
 *
 * FIX: added BILL_JOURNAL_ENTRY_DATE_SQL / BILL_JOURNAL_ENTRY_MEMO_SQL (same correlation as the
 * existing BILL_JOURNAL_ENTRY_ID_SQL) and select them alongside journal_entry_id at both call sites.
 *
 * Static check (always runs): both list query sites carry all 3 journal_entry_* selections.
 *
 * Live check (opt-in): every posted USMCA/TRANSP/TRK bill (has a journal_entry_id) also resolves a
 * non-null journal_entry_date via the exact SQL the fixed constants use.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-list-journal-entry-date-memo-resolves";
const TARGET_REL = "apps/backend/src/accounting/bills.service.ts";
const SELECT_BLOCK = "${BILL_JOURNAL_ENTRY_ID_SQL} AS journal_entry_id,\n               ${BILL_JOURNAL_ENTRY_DATE_SQL} AS journal_entry_date,\n               ${BILL_JOURNAL_ENTRY_MEMO_SQL} AS journal_entry_memo";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertJournalEntryDateMemoSelected(source) {
  const errors = [];
  const siteCount = (source.match(/\$\{BILL_JOURNAL_ENTRY_ID_SQL\} AS journal_entry_id/g) ?? []).length;
  const dateCount = (source.match(/\$\{BILL_JOURNAL_ENTRY_DATE_SQL\} AS journal_entry_date/g) ?? []).length;
  const memoCount = (source.match(/\$\{BILL_JOURNAL_ENTRY_MEMO_SQL\} AS journal_entry_memo/g) ?? []).length;

  if (siteCount < 2) errors.push(`only ${siteCount} of 2 expected journal_entry_id select sites found`);
  if (dateCount < siteCount) errors.push(`only ${dateCount} of ${siteCount} sites select journal_entry_date`);
  if (memoCount < siteCount) errors.push(`only ${memoCount} of ${siteCount} sites select journal_entry_memo`);
  if (!/const BILL_JOURNAL_ENTRY_DATE_SQL/.test(source)) errors.push("BILL_JOURNAL_ENTRY_DATE_SQL constant missing");
  if (!/const BILL_JOURNAL_ENTRY_MEMO_SQL/.test(source)) errors.push("BILL_JOURNAL_ENTRY_MEMO_SQL constant missing");

  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertJournalEntryDateMemoSelected(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "date/memo selections removed from both sites",
      live.replaceAll(SELECT_BLOCK, "${BILL_JOURNAL_ENTRY_ID_SQL} AS journal_entry_id"),
      "sites select journal_entry_date",
    ],
    [
      "BILL_JOURNAL_ENTRY_DATE_SQL constant removed",
      live.replace(/const BILL_JOURNAL_ENTRY_DATE_SQL = `[\s\S]*?`;\n/, ""),
      "BILL_JOURNAL_ENTRY_DATE_SQL constant missing",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertJournalEntryDateMemoSelected(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT b.operating_company_id::text AS operating_company_id, count(*) AS unresolved
        FROM accounting.bills b
        JOIN accounting.journal_entry_postings jep
          ON jep.operating_company_id = b.operating_company_id
         AND jep.source_transaction_type = 'bill'
         AND jep.source_transaction_id = b.id::text
        LEFT JOIN accounting.journal_entries je
          ON je.id = jep.journal_entry_uuid AND je.operating_company_id = jep.operating_company_id
        WHERE je.entry_date IS NULL
        GROUP BY b.operating_company_id
        HAVING count(*) > 0;
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;

    if (res.rows.length > 0) {
      const rows = res.rows.map((row) => `${row.operating_company_id}: ${row.unresolved} unresolved`).join(", ");
      console.error(`${LABEL} FAILED\n- posted bills whose JE date does not resolve: ${rows}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertJournalEntryDateMemoSelected(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
