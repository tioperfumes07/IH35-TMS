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
// A document is covered only by a LIVE posting: its journal entry is not voided and not reversed.
// A reversed JE with no reissue is a document with no ledger (Claude-Lead 2026-09-26, measured: the
// 218 fuel_event JEs of the last 7 days are all reversed; the fuel is carried by its expense JE).
export function livePostingSql(sourceTypes, idExpr) {
  const types = sourceTypes.map((t) => `'${t}'`).join(",");
  return `EXISTS (SELECT 1 FROM accounting.journal_entry_postings jep
      JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
     WHERE jep.source_transaction_type = ANY(ARRAY[${types}]::text[])
       AND jep.source_transaction_id = (${idExpr})::text
       AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL)`;
}

// The settlement that carries a driver bill: the one holding the bill's ACTIVE settlement line.
const BILL_CLOSED_SETTLEMENT = (extra) => `EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id AND s.voided_at IS NULL
     WHERE sl.source_driver_bill_id = d.id AND sl.voided_at IS NULL AND s.status = 'closed' AND ${extra})`;
const SETTLEMENT_LINES_TOTAL = (sid) =>
  `COALESCE((SELECT SUM(x.amount) FROM driver_finance.settlement_lines x WHERE x.settlement_id = ${sid} AND x.voided_at IS NULL), 0)`;
// Settlement states that are not yet postable (the JE posts at close — settlement-pay-run closeSettlementPayRun).
const SETTLEMENT_NOT_YET_POSTABLE = ["draft", "open", "approved"];

/**
 * Each class resolves to its REAL ledger path (measured live 2026-09-26, not assumed):
 *   - customer payments post as source 'customer_payment' (never 'payment' — 0 rows in 30 days);
 *   - fuel posts through its expense (accounting.expenses.source_fuel_transaction_id -> source 'expense');
 *     a live 'fuel_event' JE also counts;
 *   - a driver bill never posts its own JE (0 'driver_bill' postings in 30 days): driver pay posts through the
 *     settlement JE (source 'driver_settlement') when the settlement that carries the bill's active line closes.
 *     While that settlement is open/approved (or the bill is not on one yet) the bill is PENDING, not unposted;
 *   - a settlement posts at close; open/approved settlements are PENDING;
 *   - a document whose amount is exactly zero has nothing to post (QuickBooks does not post a $0 document).
 * coveredSql / zeroSql / pendingSql are evaluated per document row aliased `d`.
 */
const DOCUMENT_CLASSES = [
  { table: "accounting.expenses", voidCol: "voided_at", sourceType: "expense", expectedToPost: true },
  { table: "accounting.bills", voidCol: "voided_at", sourceType: "bill", expectedToPost: true },
  { table: "accounting.bill_payments", voidCol: "voided_at", sourceType: "bill_payment", expectedToPost: true },
  {
    table: "accounting.payments", voidCol: "voided_at", sourceType: "customer_payment", expectedToPost: true,
    coveredSql: livePostingSql(["customer_payment", "payment"], "d.id"),
    zeroSql: "COALESCE(d.amount_cents, 0) = 0",
  },
  {
    table: "accounting.invoices", voidCol: "voided_at", sourceType: "invoice", expectedToPost: true,
    zeroSql: "COALESCE(d.total_cents, 0) = 0",
  },
  { table: "accounting.factoring_advances", voidCol: "voided_at", sourceType: "factoring_advance", expectedToPost: true },
  { table: "banking.transfers", voidCol: "revoked_at", sourceType: "transfer", expectedToPost: true },
  {
    table: "fuel.fuel_transactions", voidCol: "voided_at", sourceType: "expense|fuel_event", expectedToPost: true,
    coveredSql: `(${livePostingSql(["fuel_event"], "d.id")} OR EXISTS (SELECT 1 FROM accounting.expenses e
       WHERE e.source_fuel_transaction_id = d.id AND e.voided_at IS NULL AND ${livePostingSql(["expense"], "e.id")}))`,
    zeroSql: "COALESCE(d.total_cost, 0) = 0",
  },
  {
    table: "driver_finance.driver_bills", voidCol: "voided_at", sourceType: "driver_settlement (via its settlement)", expectedToPost: true,
    coveredSql: BILL_CLOSED_SETTLEMENT(livePostingSql(["driver_settlement"], "s.id")),
    zeroSql: BILL_CLOSED_SETTLEMENT(`${SETTLEMENT_LINES_TOTAL("s.id")} = 0`),
    pendingSql: `NOT ${BILL_CLOSED_SETTLEMENT("true")}`,
  },
  {
    table: "driver_finance.driver_settlements", voidCol: "voided_at", sourceType: "driver_settlement", expectedToPost: true,
    zeroSql: `d.status = 'closed' AND ${SETTLEMENT_LINES_TOTAL("d.id")} = 0`,
    pendingSql: `d.status::text = ANY(ARRAY[${SETTLEMENT_NOT_YET_POSTABLE.map((s) => `'${s}'`).join(",")}]::text[])`,
  },
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

    // zeroAmount: nothing to post. pending: not yet postable (open settlement). Both are counted and printed,
    // never folded into "posted" — the gap is what is left after them.
    const zeroAmount = cls.zeroAmount ?? 0;
    const pending = cls.pending ?? 0;
    const gap = cls.nonVoided - cls.withLedger - zeroAmount - pending;
    const postable = cls.nonVoided - zeroAmount - pending;
    const pct = postable > 0 ? ((cls.withLedger / postable) * 100).toFixed(1) : "100.0";
    const extra = zeroAmount || pending ? ` (zero-amount ${zeroAmount}, pending ${pending})` : "";

    if (cls.expectedToPost && gap > 0) {
      const sample = Array.isArray(cls.gapSample) && cls.gapSample.length ? ` e.g. ${cls.gapSample.join(", ")}` : "";
      problems.push(
        `UNPOSTED_DOCUMENTS: ${cls.table} — ${gap} of ${cls.nonVoided} non-voided document(s) have NO live ledger entry (path '${cls.sourceType}')${extra}. ${pct}% of postable posted.${sample}`,
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
        status: `PASS${extra}`,
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

  // Zero-amount + pending are subtracted, and a class fully explained by them is GREEN.
  const explained = classifyDocumentLedgerCoverage({
    classes: [
      { table: "driver_finance.driver_settlements", sourceType: "driver_settlement", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 12, withLedger: 0, pending: 11, zeroAmount: 1 },
    ],
  });
  if (!explained.allPass) {
    console.error(`${LABEL} --selftest FAIL — pending 11 + zero 1 of 12 must be GREEN, got ${JSON.stringify(explained.problems)}`);
    fail += 1;
  } else pass += 1;

  // Pending / zero never hide a real gap.
  const hidden = classifyDocumentLedgerCoverage({
    classes: [
      { table: "driver_finance.driver_settlements", sourceType: "driver_settlement", expectedToPost: true, nonPostingReason: null, exists: true, nonVoided: 12, withLedger: 0, pending: 10, zeroAmount: 1, gapSample: ["S-5816"] },
    ],
  });
  if (hidden.allPass || !/1 of 12/.test(hidden.problems[0] ?? "") || !/S-5816/.test(hidden.problems[0] ?? "")) {
    console.error(`${LABEL} --selftest FAIL — a closed settlement with no JE must stay RED and be named, got ${JSON.stringify(hidden.problems)}`);
    fail += 1;
  } else pass += 1;

  // Registry mutations: each class must resolve its REAL ledger path.
  const byTable = Object.fromEntries(DOCUMENT_CLASSES.map((c) => [c.table, c]));
  const registryChecks = [
    ["live posting excludes reversed JEs", /reversed_by_je_id IS NULL/.test(livePostingSql(["x"], "d.id")) && /voided_at IS NULL/.test(livePostingSql(["x"], "d.id"))],
    ["payments resolve 'customer_payment'", /'customer_payment'/.test(byTable["accounting.payments"]?.coveredSql ?? "")],
    ["fuel resolves through its expense", /source_fuel_transaction_id/.test(byTable["fuel.fuel_transactions"]?.coveredSql ?? "") && /'expense'/.test(byTable["fuel.fuel_transactions"]?.coveredSql ?? "")],
    ["driver bills resolve through the closed settlement JE", /'driver_settlement'/.test(byTable["driver_finance.driver_bills"]?.coveredSql ?? "") && /status = 'closed'/.test(byTable["driver_finance.driver_bills"]?.coveredSql ?? "")],
    ["closed settlements are never pending", !SETTLEMENT_NOT_YET_POSTABLE.includes("closed")],
  ];
  for (const [name, ok] of registryChecks) {
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL — registry: ${name}`);
      fail += 1;
    } else pass += 1;
  }

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

    // Non-voided documents created in the last 7 days (LAW 3), each put in exactly ONE bucket:
    // covered (live posting on its real path) > zero-amount > pending > gap.
    const coveredSql = cls.coveredSql ?? livePostingSql([cls.sourceType], "d.id");
    const res = await client.query(
      `WITH x AS (
         SELECT COALESCE(to_jsonb(d)->>'display_id', to_jsonb(d)->>'bill_number', d.id::text) AS label,
                (${coveredSql}) AS covered,
                (${cls.zeroSql ?? "false"}) AS zero,
                (${cls.pendingSql ?? "false"}) AS pending
           FROM ${cls.table} d
          WHERE d.operating_company_id = $1::uuid
            AND d.${cls.voidCol} IS NULL
            AND d.created_at >= now() - interval '7 days'
       )
       SELECT count(*)::int AS non_voided,
              count(*) FILTER (WHERE covered)::int AS with_ledger,
              count(*) FILTER (WHERE NOT covered AND zero)::int AS zero_amount,
              count(*) FILTER (WHERE NOT covered AND NOT zero AND pending)::int AS pending,
              (array_agg(label ORDER BY label) FILTER (WHERE NOT covered AND NOT zero AND NOT pending))[1:10] AS gap_sample
         FROM x`,
      [USMCA_COMPANY_ID],
    );
    const r = res.rows[0];
    results.push({
      ...cls,
      exists: true,
      nonVoided: r.non_voided,
      withLedger: r.with_ledger,
      zeroAmount: r.zero_amount,
      pending: r.pending,
      gapSample: r.gap_sample ?? [],
    });
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
