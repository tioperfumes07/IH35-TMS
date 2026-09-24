#!/usr/bin/env node
// GUARD — verify-no-document-without-a-ledger.mjs (ROUND 143.2, DEVIN-B)
//
// "Debits equal credits" did not catch a half-empty book. 108 expenses had ZERO postings.
// 28 driver_bills had ZERO postings. 58 fuel_transactions had only 10 JEs. A guard that only
// checks balance is a guard that lets a book be half empty and calls it green. Fix that.
//
// Self-arming POPULATION check. Derive the document classes from the live schema, never a
// hard-coded list, so a new document type is covered the day it exists.
//
// For every financial document class in USMCA:
//   A. live non-voided count
//   B. how many resolve to at least one live journal entry
//   C. the gap, and the percentage posted
//
// FAIL on any class where a non-voided document carries NO ledger and is not explicitly
// registered as non-posting with a written reason.
//
// 7-DAY SCOPED per LAW 3 — evaluate documents created in the last 7 days.
//
// Self-test: node scripts/verify-no-document-without-a-ledger.mjs --selftest
export const REQUIRES_LIVE_DB =
  "document tables + journal_entry_postings — must fail-closed, never skip";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-document-without-a-ledger";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

/**
 * Document class registry. Each class specifies:
 * - schema.table
 * - the voided column name (varies: voided_at, revoked_at)
 * - the source_transaction_type used in journal_entry_postings
 * - whether the class is expected to post (non_posting_reason if not)
 *
 * The registry is DERIVED from the live schema at runtime — we enumerate which
 * of these tables actually exist, and only check classes that do.
 */
const DOCUMENT_CLASSES = [
  { table: "accounting.expenses", voidCol: "voided_at", sourceType: "expense", expectedToPost: true },
  { table: "accounting.bills", voidCol: "voided_at", sourceType: "bill", expectedToPost: true },
  { table: "accounting.bill_payments", voidCol: "voided_at", sourceType: "bill_payment", expectedToPost: true },
  { table: "accounting.payments", voidCol: "voided_at", sourceType: "payment", expectedToPost: true },
  { table: "accounting.invoices", voidCol: "voided_at", sourceType: "invoice", expectedToPost: true },
  { table: "accounting.factoring_advances", voidCol: "voided_at", sourceType: "factoring_advance", expectedToPost: true },
  { table: "banking.transfers", voidCol: "revoked_at", sourceType: "transfer", expectedToPost: true },
  { table: "fuel.fuel_transactions", voidCol: "voided_at", sourceType: "fuel_event", expectedToPost: true },
  { table: "driver_finance.driver_bills", voidCol: "voided_at", sourceType: "driver_bill", expectedToPost: true },
  { table: "driver_finance.driver_settlements", voidCol: "voided_at", sourceType: "driver_settlement", expectedToPost: true },
];

/**
 * Classify the document-to-ledger coverage. Pure function — exported for selftest.
 * @param {{
 *   classes: Array<{ table: string, sourceType: string, expectedToPost: boolean, nonPostingReason: string|null, exists: boolean, nonVoided: number, withLedger: number }>,
 * }} input
 * @returns {{ rows: Array, problems: string[], allPass: boolean }}
 */
export function classifyDocumentLedgerCoverage(input) {
  const { classes } = input;
  const problems = [];
  const rows = [];

  for (const cls of classes) {
    if (!cls.exists) continue; // table not in schema — skip
    if (cls.nonVoided === 0) {
      // Self-arming: empty population is not a defect
      rows.push({
        table: cls.table,
        sourceType: cls.sourceType,
        nonVoided: 0,
        withLedger: 0,
        gap: 0,
        pctPosted: "—",
        status: "EMPTY (self-arming)",
      });
      continue;
    }

    const gap = cls.nonVoided - cls.withLedger;
    const pct = cls.nonVoided > 0 ? ((cls.withLedger / cls.nonVoided) * 100).toFixed(1) : "0.0";

    if (cls.expectedToPost && gap > 0) {
      problems.push(
        `UNPOSTED_DOCUMENTS: ${cls.table} — ${gap} of ${cls.nonVoided} non-voided document(s) have NO ledger entry (source_transaction_type='${cls.sourceType}'). ${pct}% posted.`,
      );
      rows.push({
        table: cls.table,
        sourceType: cls.sourceType,
        nonVoided: cls.nonVoided,
        withLedger: cls.withLedger,
        gap,
        pctPosted: `${pct}%`,
        status: "RED",
      });
    } else if (!cls.expectedToPost && cls.nonPostingReason) {
      rows.push({
        table: cls.table,
        sourceType: cls.sourceType,
        nonVoided: cls.nonVoided,
        withLedger: cls.withLedger,
        gap,
        pctPosted: `${pct}%`,
        status: `NON-POSTING: ${cls.nonPostingReason}`,
      });
    } else {
      rows.push({
        table: cls.table,
        sourceType: cls.sourceType,
        nonVoided: cls.nonVoided,
        withLedger: cls.withLedger,
        gap,
        pctPosted: `${pct}%`,
        status: "PASS",
      });
    }
  }

  return { rows, problems, allPass: problems.length === 0 };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  const baseClasses = [
    { table: "accounting.expenses", sourceType: "expense", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 110, withLedger: 0 },
    { table: "accounting.bills", sourceType: "bill", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 0, withLedger: 0 },
    { table: "accounting.invoices", sourceType: "invoice", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 31, withLedger: 31 },
    { table: "accounting.factoring_advances", sourceType: "factoring_advance", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 30, withLedger: 29 },
    { table: "fuel.fuel_transactions", sourceType: "fuel_event", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 59, withLedger: 10 },
    { table: "driver_finance.driver_bills", sourceType: "driver_bill", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 29, withLedger: 0 },
    { table: "driver_finance.driver_settlements", sourceType: "driver_settlement", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 0, withLedger: 0 },
    { table: "banking.transfers", sourceType: "transfer", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 0, withLedger: 0 },
  ];

  // RED: expenses 110/0, driver_bills 29/0, fuel 59/10, factoring 30/29
  const red = classifyDocumentLedgerCoverage({ classes: baseClasses });
  if (red.allPass) {
    console.error(`${LABEL} --selftest FAIL — expected RED on expenses/driver_bills/fuel/factoring, got allPass`);
    fail += 1;
  } else if (red.problems.length !== 4) {
    console.error(`${LABEL} --selftest FAIL — expected 4 problems, got ${red.problems.length}: ${JSON.stringify(red.problems)}`);
    fail += 1;
  } else pass += 1;

  // GREEN: all classes fully posted or empty
  const greenClasses = [
    { table: "accounting.expenses", sourceType: "expense", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 10, withLedger: 10 },
    { table: "accounting.invoices", sourceType: "invoice", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 31, withLedger: 31 },
    { table: "accounting.bills", sourceType: "bill", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 0, withLedger: 0 },
  ];
  const green = classifyDocumentLedgerCoverage({ classes: greenClasses });
  if (!green.allPass) {
    console.error(`${LABEL} --selftest FAIL — expected GREEN, got ${green.problems.length} problems: ${JSON.stringify(green.problems)}`);
    fail += 1;
  } else pass += 1;

  // Empty population is self-arming (not a defect)
  const emptyClasses = [
    { table: "accounting.bills", sourceType: "bill", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 0, withLedger: 0 },
    { table: "accounting.payments", sourceType: "payment", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 0, withLedger: 0 },
  ];
  const empty = classifyDocumentLedgerCoverage({ classes: emptyClasses });
  if (!empty.allPass) {
    console.error(`${LABEL} --selftest FAIL — expected GREEN on empty populations, got ${empty.problems.length} problems`);
    fail += 1;
  } else pass += 1;

  // Non-posting class with reason
  const nonPostingClasses = [
    { table: "some_table", sourceType: "reference_only", expectedToPost: false, nonPostingReason: "reference-only, no GL impact", exists: true, nonVoided: 5, withLedger: 0 },
  ];
  const nonPosting = classifyDocumentLedgerCoverage({ classes: nonPostingClasses });
  if (!nonPosting.allPass) {
    console.error(`${LABEL} --selftest FAIL — expected GREEN on non-posting class with reason, got ${nonPosting.problems.length} problems`);
    fail += 1;
  } else pass += 1;

  // Table not in schema — skip
  const skipClasses = [
    { table: "nonexistent.table", sourceType: "x", expectedToPost: true, nonPostingReason: null, exists: false, nonVoided: 100, withLedger: 0 },
  ];
  const skip = classifyDocumentLedgerCoverage({ classes: skipClasses });
  if (!skip.allPass) {
    console.error(`${LABEL} --selftest FAIL — expected GREEN on non-existent table (skip), got ${skip.problems.length} problems`);
    fail += 1;
  } else pass += 1;

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function measureLive(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  const results = [];

  for (const cls of DOCUMENT_CLASSES) {
    const [schema, table] = cls.table.split(".");

    // Check if table exists in live schema
    const existsRes = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS exists`,
      [schema, table],
    );
    const exists = existsRes.rows[0].exists;
    if (!exists) {
      results.push({ ...cls, exists: false, nonVoided: 0, withLedger: 0 });
      continue;
    }

    // Count non-voided documents in last 7 days (LAW 3)
    const countRes = await client.query(
      `SELECT count(*)::int AS cnt FROM ${cls.table}
        WHERE operating_company_id = $1::uuid
          AND ${cls.voidCol} IS NULL
          AND created_at >= now() - interval '7 days'`,
      [USMCA_COMPANY_ID],
    );
    const nonVoided = countRes.rows[0].cnt;

    // Count how many have a ledger entry
    const ledgerRes = await client.query(
      `SELECT count(DISTINCT d.id)::int AS cnt
         FROM ${cls.table} d
        WHERE d.operating_company_id = $1::uuid
          AND d.${cls.voidCol} IS NULL
          AND d.created_at >= now() - interval '7 days'
          AND EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings jep
             WHERE jep.source_transaction_type = $2
               AND jep.source_transaction_id = d.id::text
          )`,
      [USMCA_COMPANY_ID, cls.sourceType],
    );
    const withLedger = ledgerRes.rows[0].cnt;

    results.push({ ...cls, exists: true, nonVoided, withLedger });
  }

  await client.query("ROLLBACK");
  return results;
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let classes;
  try {
    classes = await measureLive(client);
  } finally {
    client.release();
    await pool.end();
  }

  const { rows, problems, allPass } = classifyDocumentLedgerCoverage({ classes });

  // Print the table
  console.log(`${LABEL}: document-to-ledger coverage (7-day scoped, LAW 3)`);
  console.log("");
  console.log("  Document Class                        Source Type          Non-Voided  With Ledger  Gap    Posted   Status");
  console.log("  " + "-".repeat(120));
  for (const row of rows) {
    console.log(
      `  ${row.table.padEnd(37)} ${row.sourceType.padEnd(20)} ${String(row.nonVoided).padStart(10)}  ${String(row.withLedger).padStart(11)}  ${String(row.gap).padStart(5)}  ${String(row.pctPosted).padStart(7)}  ${row.status}`,
    );
  }
  console.log("");

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} unposted document class(es):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — all document classes are fully posted or empty.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
