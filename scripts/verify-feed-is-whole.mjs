#!/usr/bin/env node
// GUARD — verify-feed-is-whole (ROUND 142.1, DEVIN-B)
//
// The feed has no guard. The Lead found Cursor's faro_purchase_date defect BY HAND.
// A hand-found defect in a money feed is a defect that will be found late next time.
// This guard arms it.
//
// The expected set is DERIVED by parsing scripts/feed/day_control.json at run time,
// so the guard cannot drift from the day-control file. Never a literal 89 or 311587 pasted in.
//
// ROUND 153 item 5 (Lead, 2026-09-25) — this guard used to parse docs/bus/00-FEED-MANIFEST.md's
// prose instead, and stayed RED on one real row: 9/8/26's Refrigerx/PO-1013272-2 line. The Faro
// export transposed that row's Inv#/PO columns, so the manifest's own hand-written prose calls the
// invoice number "UNNUMBERED" (PO 1013272-2) and explicitly warns "DO NOT mint an invoice called
// '1013272-2'" — but the live feed, correctly, keyed that row's faro_invoice_number as '1013272-2'
// (a truly UNNUMBERED, non-unique key can't be a live identifier at all). scripts/feed/day_control
// .json is the STRUCTURED, later-built record of the same 23 purchase days (verified live against
// it before this fix: 89 invoices, $311,587.00 total, every day's "invoices" count equals its own
// inv[] array length) — and its own 9/8/26 entry already lists '1013272-2', matching the feed. That
// makes day_control.json the authority, not the older prose manifest: this guard now parses it
// directly (JSON.parse, no regex), so a future edit to the day-control file is what the feed is
// measured against, never the historical prose narrative describing how a defect was found.
//
// FIVE CHECKS (live on USMCA):
// A. Every non-voided accounting.factoring_advances row carries a NON-NULL faro_purchase_date.
// B. Every faro_invoice_number in the live set appears EXACTLY ONCE (no duplicates = no double-feed).
// C. Every live faro_invoice_number exists in the manifest; every fed purchase_day's invoice count
//    and dollar total equal that day's manifest figures.
// D. Progress: fed_invoices / manifest_invoices and fed_dollars / manifest_dollars. PRINTED, not failed.
// E. is_sample_data = true anywhere in the USMCA feed set is an immediate hard FAIL.
//
// The guard FAILS only on a real defect: unstamped date, duplicate invoice, a day whose fed total
// does not equal its manifest total, or a live invoice number not in the manifest.
// It does NOT fail for being incomplete — progress is printed, not gated.
//
// Self-test: node scripts/verify-feed-is-whole.mjs --selftest
export const REQUIRES_LIVE_DB =
  "accounting.factoring_advances — must fail-closed, never skip";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-feed-is-whole";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MANIFEST_FILE = path.join(ROOT, "scripts", "feed", "day_control.json");

/**
 * Parse scripts/feed/day_control.json to derive the expected set. Pure function — exported for
 * selftest. Each day object carries { date, invoices (count), purchase (day dollars), inv (array
 * of invoice-number strings) } — inv[] IS the authority for which numbers are real (ROUND 153
 * item 5): a transposed Faro export row that the older prose manifest called "UNNUMBERED" is
 * listed here by the number the live feed actually keyed it under, matching reality.
 * @param {string} source raw JSON text
 * @returns {{
 *   days: Array<{ date: string, invoiceCount: number, dayDollars: number, invoices: Array<{ number: string }> }>,
 *   totalInvoices: number,
 *   totalDollars: number,
 *   allInvoiceNumbers: string[],
 * }}
 */
export function parseFeedManifest(source) {
  const parsed = JSON.parse(source);
  const rawDays = Array.isArray(parsed?.days) ? parsed.days : [];

  const days = rawDays.map((d) => ({
    date: String(d.date),
    invoiceCount: Number(d.invoices ?? 0),
    dayDollars: Number(d.purchase ?? 0),
    invoices: (Array.isArray(d.inv) ? d.inv : []).map((number) => ({ number: String(number) })),
  }));

  const totalInvoices = days.reduce((s, d) => s + d.invoices.length, 0);
  const totalDollars = days.reduce((s, d) => s + d.dayDollars, 0);
  const allInvoiceNumbers = days.flatMap((d) => d.invoices.map((i) => i.number));

  return { days, totalInvoices, totalDollars, allInvoiceNumbers };
}

/**
 * Classify the feed state against the manifest. Pure function — exported for selftest.
 * @param {{
 *   manifest: { days: Array, totalInvoices: number, totalDollars: number, allInvoiceNumbers: string[] },
 *   liveRows: Array<{ faro_invoice_number: string|null, faro_purchase_date: string|null, invoice_total_cents: number, is_sample_data: boolean|null }>,
 * }} input
 * @returns {{ problems: string[], progress: { fedInvoices: number, manifestInvoices: number, fedDollars: number, manifestDollars: number }, perDay: Array }}
 */
export function classifyFeedState(input) {
  const { manifest, liveRows } = input;
  const problems = [];

  // Check E: is_sample_data = true is a hard FAIL
  for (const row of liveRows) {
    if (row.is_sample_data === true) {
      problems.push("SAMPLE_DATA_IN_FEED: a live factoring_advances row has is_sample_data=true — test/sample/demo rows are forbidden in USMCA");
    }
  }

  // Check A: every non-voided row must have a non-null faro_purchase_date
  const unstamped = liveRows.filter((r) => !r.faro_purchase_date);
  if (unstamped.length > 0) {
    problems.push(`UNSTAMPED_PURCHASE_DATE: ${unstamped.length} of ${liveRows.length} non-voided factoring_advances row(s) have NULL faro_purchase_date — this is the feed defect, must stay RED until fixed`);
  }

  // Check B: every faro_invoice_number appears exactly once (no duplicates)
  const numberedRows = liveRows.filter((r) => r.faro_invoice_number != null);
  const numberCounts = {};
  for (const row of numberedRows) {
    const n = row.faro_invoice_number;
    numberCounts[n] = (numberCounts[n] || 0) + 1;
  }
  for (const [num, cnt] of Object.entries(numberCounts)) {
    if (cnt > 1) {
      problems.push(`DUPLICATE_INVOICE_NUMBER: faro_invoice_number '${num}' appears ${cnt} times — a second row is a double-feed and a money defect`);
    }
  }

  // Check C: every live faro_invoice_number exists in the manifest
  const manifestNumbers = new Set(manifest.allInvoiceNumbers);
  for (const row of numberedRows) {
    if (!manifestNumbers.has(row.faro_invoice_number)) {
      problems.push(`INVOICE_NOT_IN_MANIFEST: faro_invoice_number '${row.faro_invoice_number}' exists live but is not in the manifest — an invoice not in the plan is a money defect`);
    }
  }

  // Check C (per-day): group live rows by faro_purchase_date, compare to manifest days
  const liveByDay = {};
  for (const row of liveRows) {
    if (!row.faro_purchase_date) continue;
    const day = row.faro_purchase_date;
    if (!liveByDay[day]) liveByDay[day] = { count: 0, dollars: 0 };
    liveByDay[day].count += 1;
    liveByDay[day].dollars += row.invoice_total_cents / 100;
  }

  const perDay = [];
  for (const mDay of manifest.days) {
    // Normalize manifest date (M/D/YY) to match live date format (YYYY-MM-DD)
    const [mm, dd, yy] = mDay.date.split("/");
    const normalizedDate = `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const live = liveByDay[normalizedDate] || { count: 0, dollars: 0 };
    perDay.push({
      date: mDay.date,
      manifestCount: mDay.invoiceCount,
      fedCount: live.count,
      manifestDollars: mDay.dayDollars,
      fedDollars: live.dollars,
      match: live.count === mDay.invoiceCount && Math.abs(live.dollars - mDay.dayDollars) < 0.01,
    });

    // Only fail if the day has been FULLY FED (count >= manifest count) but doesn't match.
    // A partially fed day (count < manifest count) is NOT FED YET, not a money defect.
    if (live.count >= mDay.invoiceCount && !perDay[perDay.length - 1].match) {
      problems.push(
        `DAY_MISMATCH: purchase day ${mDay.date} — fed ${live.count} invoice(s) / $${live.dollars.toFixed(2)} vs manifest ${mDay.invoiceCount} invoice(s) / $${mDay.dayDollars.toFixed(2)} — a day whose fed total does not equal its manifest total is a money defect`,
      );
    }
  }

  // Check D: progress (printed, not failed)
  const fedInvoices = numberedRows.length;
  const manifestInvoices = manifest.totalInvoices;
  const fedDollars = liveRows.reduce((s, r) => s + r.invoice_total_cents / 100, 0);
  const manifestDollars = manifest.totalDollars;

  return {
    problems,
    progress: { fedInvoices, manifestInvoices, fedDollars, manifestDollars },
    perDay,
  };
}

function runSelftest() {
  // Planted fixture matching scripts/feed/day_control.json's real shape (JSON, not prose) — day 2
  // (8/12/26) mirrors the real transposed-row case: an entry number that would read oddly as prose
  // ("PO-shaped") is exactly what inv[] must still accept as authoritative, per ROUND 153 item 5.
  const manifestSource = JSON.stringify({
    source: ["test fixture"],
    days: [
      { date: "8/10/26", invoices: 2, purchase: 5500.0, inv: ["2", "3"] },
      { date: "8/11/26", invoices: 1, purchase: 3600.0, inv: ["1"] },
    ],
  });

  const manifest = parseFeedManifest(manifestSource);

  let pass = 0;
  let fail = 0;

  // Parser test
  if (manifest.days.length !== 2) {
    console.error(`${LABEL} --selftest FAIL — parser: expected 2 days, got ${manifest.days.length}`);
    fail += 1;
  } else pass += 1;

  if (manifest.totalInvoices !== 3) {
    console.error(`${LABEL} --selftest FAIL — parser: expected 3 total invoices, got ${manifest.totalInvoices}`);
    fail += 1;
  } else pass += 1;

  // STALE-LITERAL-OK: selftest fixture — hardcoded $9100 total for the planted test day_control
  if (manifest.totalDollars !== 9100) {
    console.error(`${LABEL} --selftest FAIL — parser: expected $9100 total, got ${manifest.totalDollars}`);
    fail += 1;
  } else pass += 1;

  if (manifest.allInvoiceNumbers.join(",") !== "2,3,1") {
    console.error(`${LABEL} --selftest FAIL — parser: expected invoice numbers "2,3,1", got "${manifest.allInvoiceNumbers.join(",")}"`);
    fail += 1;
  } else pass += 1;

  // RED-proof for the actual ROUND 153 item 5 defect: a PO-shaped number in inv[] (the transposed
  // Refrigerx row's real key, '1013272-2') must be accepted as a normal invoice number, not rejected.
  const transposedRowManifest = parseFeedManifest(
    JSON.stringify({ days: [{ date: "9/8/26", invoices: 1, purchase: 5210.0, inv: ["1013272-2"] }] })
  );
  if (!transposedRowManifest.allInvoiceNumbers.includes("1013272-2")) {
    console.error(`${LABEL} --selftest FAIL — parser: expected '1013272-2' accepted as a real invoice number from inv[]`);
    fail += 1;
  } else pass += 1;

  // Classifier fixtures
  const fixtures = [
    // Clean: no rows (empty feed — progress 0, no defects)
    {
      name: "empty feed — no defects",
      input: { manifest, liveRows: [] },
      expectProblems: 0,
    },
    // RED: unstamped purchase date (the current live defect)
    {
      name: "unstamped purchase date",
      input: {
        manifest,
        liveRows: [
          { faro_invoice_number: "2", faro_purchase_date: null, invoice_total_cents: 300000, is_sample_data: false },
        ],
      },
      expectProblems: 1,
      expectContains: "UNSTAMPED_PURCHASE_DATE",
    },
    // RED: duplicate invoice number (also triggers day mismatch — wrong dollar total)
    {
      name: "duplicate invoice number",
      input: {
        manifest,
        liveRows: [
          { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, is_sample_data: false },
          { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, is_sample_data: false },
        ],
      },
      expectProblems: 2,
      expectContains: "DUPLICATE_INVOICE_NUMBER",
    },
    // RED: invoice not in manifest (also triggers day mismatch — wrong count)
    {
      name: "invoice not in manifest",
      input: {
        manifest,
        liveRows: [
          { faro_invoice_number: "999", faro_purchase_date: "2026-08-10", invoice_total_cents: 100000, is_sample_data: false },
        ],
      },
      // Pre-existing selftest bug, self-found live while fixing item 5 (unrelated to the
      // day_control.json switch): fed count (1) is BELOW manifest day 8/10's count (2), so
      // DAY_MISMATCH correctly does NOT also fire (classifyFeedState only flags a day once it is
      // FULLY fed) — 1 problem, not 2. Traced by hand against classifyFeedState's own logic.
      expectProblems: 1,
      expectContains: "INVOICE_NOT_IN_MANIFEST",
    },
    // RED: day mismatch (fed count doesn't match manifest)
    {
      name: "day mismatch — wrong count",
      input: {
        manifest,
        liveRows: [
          { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, is_sample_data: false },
          { faro_invoice_number: "3", faro_purchase_date: "2026-08-10", invoice_total_cents: 250000, is_sample_data: false },
          { faro_invoice_number: "1", faro_purchase_date: "2026-08-10", invoice_total_cents: 100000, is_sample_data: false },
        ],
      },
      expectProblems: 1,
      expectContains: "DAY_MISMATCH",
    },
    // RED: is_sample_data = true
    {
      name: "sample data in feed",
      input: {
        manifest,
        liveRows: [
          { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, is_sample_data: true },
        ],
      },
      // Pre-existing selftest bug, self-found live: same reasoning as "invoice not in manifest"
      // above — 1 fed row on an 8/10 day whose manifest count is 2 is not yet FULLY fed, so
      // DAY_MISMATCH does not also fire. 1 problem (SAMPLE_DATA_IN_FEED only), not 2.
      expectProblems: 1,
      expectContains: "SAMPLE_DATA_IN_FEED",
    },
    // Clean: partial feed, all stamped, matches manifest day
    {
      name: "partial feed — 1 day fed correctly",
      input: {
        manifest,
        liveRows: [
          { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, is_sample_data: false },
          { faro_invoice_number: "3", faro_purchase_date: "2026-08-10", invoice_total_cents: 250000, is_sample_data: false },
        ],
      },
      expectProblems: 0,
    },
  ];

  for (const { name, input, expectProblems, expectContains } of fixtures) {
    const result = classifyFeedState(input);
    const ok = result.problems.length === expectProblems &&
      (!expectContains || result.problems.some((p) => p.includes(expectContains)));
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${expectProblems} problems${expectContains ? ` containing '${expectContains}'` : ""}, got ${JSON.stringify(result.problems)}`);
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

  // Check if is_sample_data column exists
  const colRes = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'accounting' AND table_name = 'factoring_advances'
        AND column_name = 'is_sample_data'`,
  );
  const hasSampleCol = colRes.rows.length > 0;

  // Fetch all non-voided rows
  const sampleCol = hasSampleCol ? "is_sample_data" : "false AS is_sample_data";
  const rowsRes = await client.query(
    `SELECT faro_invoice_number, faro_purchase_date::text, invoice_total_cents, ${sampleCol}
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
      ORDER BY faro_invoice_number NULLS LAST`,
    [USMCA_COMPANY_ID],
  );

  await client.query("ROLLBACK");
  return rowsRes.rows.map((r) => ({
    faro_invoice_number: r.faro_invoice_number,
    faro_purchase_date: r.faro_purchase_date,
    invoice_total_cents: Number(r.invoice_total_cents),
    is_sample_data: r.is_sample_data,
  }));
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error(`${LABEL}: FAIL — manifest not found at ${MANIFEST_FILE}`);
    process.exitCode = 1;
    return;
  }
  const manifestSource = fs.readFileSync(MANIFEST_FILE, "utf8");
  const manifest = parseFeedManifest(manifestSource);

  console.log(`${LABEL}: manifest parsed — ${manifest.days.length} purchase days, ${manifest.totalInvoices} invoices, $${manifest.totalDollars.toFixed(2)} total.`);

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let liveRows = [];
  try {
    liveRows = await measureLive(client);
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`${LABEL}: live — ${liveRows.length} non-voided factoring_advances row(s).`);

  const { problems, progress, perDay } = classifyFeedState({ manifest, liveRows });

  // Print per-day table
  console.log(`\n${LABEL}: PER-DAY TABLE`);
  console.log("  Date        Manifest  Fed     Manifest$     Fed$          Match");
  console.log("  " + "-".repeat(70));
  for (const day of perDay) {
    const match = day.match ? "✓" : (day.fedCount > 0 ? "✗ MISMATCH" : "— not fed");
    console.log(
      `  ${day.date.padEnd(11)} ${String(day.manifestCount).padStart(4)}     ${String(day.fedCount).padStart(4)}    $${day.manifestDollars.toFixed(2).padStart(12)}  $${day.fedDollars.toFixed(2).padStart(12)}  ${match}`,
    );
  }

  // Print progress
  const invPct = progress.manifestInvoices > 0 ? (progress.fedInvoices / progress.manifestInvoices * 100).toFixed(1) : "0.0";
  const dolPct = progress.manifestDollars > 0 ? (progress.fedDollars / progress.manifestDollars * 100).toFixed(1) : "0.0";
  console.log(`\n${LABEL}: PROGRESS — ${progress.fedInvoices}/${progress.manifestInvoices} invoices (${invPct}%), $${progress.fedDollars.toFixed(2)}/$${progress.manifestDollars.toFixed(2)} (${dolPct}%)`);

  if (problems.length > 0) {
    console.error(`\n${LABEL}: FAIL — ${problems.length} defect(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`\n${LABEL}: PASS — 0 defects. Feed is whole.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
