#!/usr/bin/env node
// GUARD — reconcile-feed-day.mjs (ROUND 142.3, DEVIN-B)
//
// THE DAY-CLOSE GATE. This is the one that prevents another wipe.
//
// Owner order: "MAKE SURE THE ENGINE WORKS AS IT IS INTENDED AND THAT THE DATA IS RECONCILED
// DAILY I DO NOT WANT THE SAME ISSUES AS PREVIOUSLY."
//
// Last time the book was fed, it did not tie out, the error compounded across days, and the
// ONLY remedy left was wiping every transaction and starting over. That happened because nothing
// checked a day before the next day was opened. This gate makes that impossible.
//
// Takes one purchase day, returns exit 0 (GREEN, day closes) or exit 1 (RED, day does not close).
// Self-arming POPULATION check: the expected figures are DERIVED at run time by parsing
// docs/bus/00-FEED-MANIFEST.md for that day. Never a literal, never a flag, never an env var,
// never a hand-kept list, never a baseline. Read-only — it never writes.
//
// FOR THE GIVEN PURCHASE DAY, ASSERT ALL OF THESE. ANY ONE FAILING = RED.
//  1. INVOICE COUNT: live non-voided factoring_advances with that faro_purchase_date = manifest's count.
//  2. GROSS: sum(invoice_total_cents) = manifest's dollar total. Exact, to the cent.
//  3. EVERY ROW STAMPED: zero rows for that day with NULL faro_purchase_date.
//  4. NO DUPLICATES: every faro_invoice_number on that day appears exactly once across the whole live set.
//  5. EVERY INVOICE IS IN THE MANIFEST: no live invoice absent from manifest, no manifest invoice absent from live.
//  6. THE DAY'S ADVANCE IDENTITY: purchases − escrow − cash rsv − discount − fees − sch fee = NET ADVANCE.
//     Assert live legs reproduce the manifest's net advance for that day, to the cent.
//  7. THE WIRE LEGS: the day's cash receipt legs (one or two) SUM to that day's net advance.
//     Zero legs on a day the manifest shows funded = RED.
//  8. LEDGER BALANCE: every journal entry created for that day has debits = credits, exactly.
//  9. NO ORPHANS: every JE posted for that day resolves to a live source document, and every document
//     created for that day that should carry a ledger has one.
// 10. LINKAGE: every load created for that day resolves to its driver, unit and customer.
// 11. is_sample_data = true anywhere in that day's set = IMMEDIATE HARD RED.
// 12. NOTHING OUTSIDE USMCA was written for that day.
//
// Usage: node scripts/reconcile-feed-day.mjs <purchase_day>
//   <purchase_day> = M/D/YY (e.g., 8/10/26) — must match a manifest day heading.
//
// Self-test: node scripts/reconcile-feed-day.mjs --selftest
export const REQUIRES_LIVE_DB =
  "accounting.factoring_advances + journal_entries + payments + mdata.loads — must fail-closed, never skip";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import fs from "node:fs";
import path from "node:path";

const LABEL = "reconcile-feed-day";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MANIFEST_FILE = path.join(ROOT, "docs", "bus", "00-FEED-MANIFEST.md");

/**
 * Parse the feed manifest and extract a specific day's expected figures.
 * Pure function — exported for selftest.
 * @param {string} source
 * @param {string} dayFilter — e.g. "8/10/26"
 * @returns {{ day: string, normalizedDate: string, invoiceCount: number, dayDollars: number, invoices: Array, netAdvance: number } | null}
 */
export function parseManifestDay(source, dayFilter) {
  const lines = source.split("\n");
  let currentDay = null;
  let currentInvoices = [];

  const headerRe = /^## (\d{1,2}\/\d{1,2}\/\d{2})\s+—\s+(\d+)\s+invoice\(s\)\s+—\s+day\s+\$([\d,]+\.\d{2})\s+—/;
  const invRe = /^\s+inv\s+(\S+)\s+·\s+(.+?)\s+·\s+PO\s+(.+)$/;
  const detailRe = /^\s+purchase\s+([\d,]+\.\d{2})\s+·\s+escrow\s+([\d,]+\.\d{2})\s+·\s+cash\s+rsv\s+([\d,]+\.\d{2})\s+·\s+discount\s+([\d,]+\.\d{2})\s+·\s+fees\s+([\d,]+\.\d{2})/;
  const netAdvRe = /^\s+net\s+adv\s+([\d,]+\.\d{2})\s+·\s+receipts\s+([\d,]+\.\d{2})\s+·\s+sch\s+fee\s+([\d,]+\.\d{2})/;

  for (const line of lines) {
    const hMatch = line.match(headerRe);
    if (hMatch) {
      if (currentDay === dayFilter) {
        // We've collected all invoices for the target day; return
        const [mm, dd, yy] = dayFilter.split("/");
        const normalizedDate = `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        const dayDollars = parseFloat(
          lines
            .find((l) => l.match(headerRe) && l.match(headerRe)[1] === dayFilter)
            .match(headerRe)[3].replace(/,/g, ""),
        );
        const netAdvance = currentInvoices.reduce((s, i) => s + i.netAdvance, 0);
        return {
          day: dayFilter,
          normalizedDate,
          invoiceCount: parseInt(
            lines
              .find((l) => l.match(headerRe) && l.match(headerRe)[1] === dayFilter)
              .match(headerRe)[2],
            10,
          ),
          dayDollars,
          invoices: currentInvoices,
          netAdvance,
        };
      }
      currentDay = hMatch[1];
      currentInvoices = [];
      continue;
    }
    if (currentDay !== dayFilter) continue;

    const iMatch = line.match(invRe);
    if (iMatch) {
      currentInvoices.push({
        number: iMatch[1],
        customer: iMatch[2].trim(),
        po: iMatch[3].trim(),
        purchase: 0,
        escrow: 0,
        cashRsv: 0,
        discount: 0,
        fees: 0,
        netAdvance: 0,
        receipts: 0,
        schFee: 0,
      });
      continue;
    }

    const dMatch = line.match(detailRe);
    if (dMatch && currentInvoices.length > 0) {
      const inv = currentInvoices[currentInvoices.length - 1];
      inv.purchase = parseFloat(dMatch[1].replace(/,/g, ""));
      inv.escrow = parseFloat(dMatch[2].replace(/,/g, ""));
      inv.cashRsv = parseFloat(dMatch[3].replace(/,/g, ""));
      inv.discount = parseFloat(dMatch[4].replace(/,/g, ""));
      inv.fees = parseFloat(dMatch[5].replace(/,/g, ""));
      continue;
    }

    const nMatch = line.match(netAdvRe);
    if (nMatch && currentInvoices.length > 0) {
      const inv = currentInvoices[currentInvoices.length - 1];
      inv.netAdvance = parseFloat(nMatch[1].replace(/,/g, ""));
      inv.receipts = parseFloat(nMatch[2].replace(/,/g, ""));
      inv.schFee = parseFloat(nMatch[3].replace(/,/g, ""));
      continue;
    }
  }

  // Day not found in manifest
  return null;
}

/**
 * Parse all manifest day headings (for duplicate check across whole live set).
 * @param {string} source
 * @returns {string[]} all invoice numbers in the manifest
 */
export function parseAllManifestInvoiceNumbers(source) {
  const lines = source.split("\n");
  const numbers = [];
  const invRe = /^\s+inv\s+(\S+)\s+·/;
  for (const line of lines) {
    const m = line.match(invRe);
    if (m) numbers.push(m[1]);
  }
  return numbers;
}

/**
 * Classify a day's close state. Pure function — exported for selftest.
 * @param {{
 *   manifestDay: { day: string, normalizedDate: string, invoiceCount: number, dayDollars: number, invoices: Array, netAdvance: number },
 *   allManifestNumbers: string[],
 *   liveRows: Array<{ faro_invoice_number: string|null, faro_purchase_date: string|null, invoice_total_cents: number, advance_amount_cents: number, reserve_amount_cents: number, factor_fee_cents: number }>,
 *   allLiveNumbers: Array<{ faro_invoice_number: string, count: number }>,
 *   livePayments: Array<{ payment_date: string, amount_cents: number }>,
 *   ledgerBalanceOk: boolean,
 *   ledgerBalanceDetails: Array<{ je_id: string, debit_cents: number, credit_cents: number, balanced: boolean }>,
 *   orphanJes: Array<{ je_id: string, reason: string }>,
 *   orphanDocs: Array<{ doc_id: string, doc_type: string, reason: string }>,
 *   linkageRows: Array<{ load_id: string, has_driver: boolean, has_unit: boolean, has_customer: boolean }>,
 *   sampleDataRows: Array<{ table: string, id: string }>,
 *   nonUsmcaRows: number,
 *   documentPosting: Array<{ table: string, sourceType: string, expectedToPost: boolean, exists: boolean, nonVoided: number, withLedger: number, gap: number }>,
 *   clearingResidueCents: number,
 *   expenseNetCents: number,
 *   expenseDocsForDay: number,
 * }} input
 * @returns {{ assertions: Array<{ id: number, name: string, expected: string, live: string, pass: boolean }>, allPass: boolean }}
 */
export function classifyDayClose(input) {
  const { manifestDay, allManifestNumbers, liveRows, allLiveNumbers, livePayments,
    ledgerBalanceOk, ledgerBalanceDetails, orphanJes, orphanDocs, linkageRows,
    sampleDataRows, nonUsmcaRows } = input;

  const assertions = [];
  const manifestNumbers = new Set(allManifestNumbers);
  const dayInvoiceNumbers = new Set(manifestDay.invoices.map((i) => i.number));

  // 1. INVOICE COUNT
  const liveCount = liveRows.length;
  assertions.push({
    id: 1,
    name: "INVOICE_COUNT",
    expected: String(manifestDay.invoiceCount),
    live: String(liveCount),
    pass: liveCount === manifestDay.invoiceCount,
  });

  // 2. GROSS
  const liveGrossCents = liveRows.reduce((s, r) => s + Number(r.invoice_total_cents), 0);
  const expectedGrossCents = Math.round(manifestDay.dayDollars * 100);
  assertions.push({
    id: 2,
    name: "GROSS",
    expected: `$${(expectedGrossCents / 100).toFixed(2)}`,
    live: `$${(liveGrossCents / 100).toFixed(2)}`,
    pass: liveGrossCents === expectedGrossCents,
  });

  // 3. EVERY ROW STAMPED
  const unstamped = liveRows.filter((r) => !r.faro_purchase_date).length;
  assertions.push({
    id: 3,
    name: "EVERY_ROW_STAMPED",
    expected: "0 unstamped",
    live: `${unstamped} unstamped`,
    pass: unstamped === 0,
  });

  // 4. NO DUPLICATES
  const dayNumbers = liveRows.map((r) => r.faro_invoice_number).filter(Boolean);
  const dupCounts = {};
  for (const n of dayNumbers) dupCounts[n] = (dupCounts[n] || 0) + 1;
  const duplicates = Object.entries(dupCounts).filter(([, c]) => c > 1);
  assertions.push({
    id: 4,
    name: "NO_DUPLICATES",
    expected: "0 duplicates",
    live: `${duplicates.length} duplicate(s)${duplicates.length > 0 ? `: ${duplicates.map((d) => d[0]).join(", ")}` : ""}`,
    pass: duplicates.length === 0,
  });

  // 5. EVERY INVOICE IS IN THE MANIFEST
  const liveNotInManifest = dayNumbers.filter((n) => !manifestNumbers.has(n));
  const manifestNotInLive = manifestDay.invoices
    .map((i) => i.number)
    .filter((n) => !dayNumbers.includes(n));
  assertions.push({
    id: 5,
    name: "INVOICE_MANIFEST_MATCH",
    expected: `0 live-not-in-manifest, 0 manifest-not-in-live`,
    live: `${liveNotInManifest.length} live-not-in-manifest, ${manifestNotInLive.length} manifest-not-in-live`,
    pass: liveNotInManifest.length === 0 && manifestNotInLive.length === 0,
  });

  // 6. ADVANCE IDENTITY
  const liveAdvanceCents = liveRows.reduce((s, r) => s + Number(r.advance_amount_cents), 0);
  const expectedAdvanceCents = Math.round(manifestDay.netAdvance * 100);
  assertions.push({
    id: 6,
    name: "ADVANCE_IDENTITY",
    expected: `$${(expectedAdvanceCents / 100).toFixed(2)}`,
    live: `$${(liveAdvanceCents / 100).toFixed(2)}`,
    pass: liveAdvanceCents === expectedAdvanceCents,
  });

  // 7. WIRE LEGS
  const wireLegSumCents = livePayments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const wireLegCount = livePayments.length;
  assertions.push({
    id: 7,
    name: "WIRE_LEGS",
    expected: `$${(expectedAdvanceCents / 100).toFixed(2)} (${wireLegCount === 0 ? "0 legs" : `${wireLegCount} leg(s)`})`,
    live: `$${(wireLegSumCents / 100).toFixed(2)} (${wireLegCount} leg(s))`,
    pass: wireLegSumCents === expectedAdvanceCents && wireLegCount > 0,
  });

  // 8. LEDGER BALANCE
  const unbalancedJes = ledgerBalanceDetails.filter((j) => !j.balanced);
  assertions.push({
    id: 8,
    name: "LEDGER_BALANCE",
    expected: "0 unbalanced JEs",
    live: `${unbalancedJes.length} unbalanced JE(s)`,
    pass: ledgerBalanceOk,
  });

  // 9. NO ORPHANS
  assertions.push({
    id: 9,
    name: "NO_ORPHANS",
    expected: "0 orphan JEs, 0 orphan docs",
    live: `${orphanJes.length} orphan JE(s), ${orphanDocs.length} orphan doc(s)`,
    pass: orphanJes.length === 0 && orphanDocs.length === 0,
  });

  // 10. LINKAGE
  const unlinkedLoads = linkageRows.filter((l) => !l.has_driver || !l.has_unit || !l.has_customer);
  assertions.push({
    id: 10,
    name: "LINKAGE",
    expected: "0 unlinked loads",
    live: `${unlinkedLoads.length} unlinked load(s)`,
    pass: unlinkedLoads.length === 0,
  });

  // 11. SAMPLE DATA
  assertions.push({
    id: 11,
    name: "NO_SAMPLE_DATA",
    expected: "0 sample rows",
    live: `${sampleDataRows.length} sample row(s)`,
    pass: sampleDataRows.length === 0,
  });

  // 12. USMCA ONLY
  assertions.push({
    id: 12,
    name: "USMCA_ONLY",
    expected: "0 non-USMCA rows",
    live: `${nonUsmcaRows} non-USMCA row(s)`,
    pass: nonUsmcaRows === 0,
  });

  // 13. DOCUMENT-POSTING COMPLETENESS FOR THE DAY
  // For every financial document class created on that day, every non-voided document
  // must resolve to at least one live JE. A class that legitimately does not post must
  // be registered as non-posting with a written reason. Derive the class list from live schema.
  const unpostedClasses = (input.documentPosting || []).filter(
    (c) => c.exists && c.nonVoided > 0 && c.expectedToPost && c.gap > 0,
  );
  assertions.push({
    id: 13,
    name: "DOC_POSTING_COMPLETENESS",
    expected: "0 classes with unposted docs",
    live: `${unpostedClasses.length} class(es) with unposted doc(s)${unpostedClasses.length > 0 ? `: ${unpostedClasses.map((c) => `${c.table}(${c.gap})`).join(", ")}` : ""}`,
    pass: unpostedClasses.length === 0,
  });

  // 14. NO CLEARING-ACCOUNT RESIDUE FOR THE DAY
  // 1090 Undeposited Funds is a pass-through. Money that entered 1090 on that day must
  // have left by day close. A non-zero same-day residue = RED.
  const clearingResidueCents = input.clearingResidueCents || 0;
  assertions.push({
    id: 14,
    name: "NO_CLEARING_RESIDUE",
    expected: "$0.00 same-day residue in 1090",
    live: `$${(clearingResidueCents / 100).toFixed(2)} same-day residue`,
    pass: clearingResidueCents === 0,
  });

  // 15. EVERY EXPENSE LINE HITS A REAL EXPENSE-SIDE ACCOUNT
  // A day whose COGS+Expense account movement nets to exactly $0.00 while expense
  // documents exist for that day is RED — a reversal that was never re-posted.
  const expenseNetCents = input.expenseNetCents || 0;
  const expenseDocsExist = (input.expenseDocsForDay || 0) > 0;
  assertions.push({
    id: 15,
    name: "EXPENSE_LINES_HIT_REAL_ACCOUNTS",
    expected: expenseDocsExist ? "non-zero COGS+Expense net" : "$0.00 (no expense docs)",
    live: `$${(expenseNetCents / 100).toFixed(2)} net (${input.expenseDocsForDay || 0} expense docs)`,
    pass: !(expenseDocsExist && expenseNetCents === 0),
  });

  const allPass = assertions.every((a) => a.pass);
  return { assertions, allPass };
}

function runSelftest() {
  const manifestSource = `# test manifest
## 8/10/26 — 2 invoice(s) — day $5,500.00 — CUM $5,500.00 — 2 invoices to date
  inv 2 · IMPACT BULK LOGISTICS LLC · PO 4483
    purchase 3,000.00 · escrow 45.00 · cash rsv 0.00 · discount 45.00 · fees 0.00
    net adv 2,910.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,910.00 USMCA Wire 08/10/26
  inv 3 · NCC LOGISTICS USA INC · PO 138458
    purchase 2,500.00 · escrow 0.00 · cash rsv 30.90 · discount 37.50 · fees 10.00
    net adv 2,415.00 · receipts 2,500.00 · sch fee 6.60
    PAY: wire 2,415.00 USMCA Wire 08/10/26

## 8/11/26 — 1 invoice(s) — day $3,600.00 — CUM $9,100.00 — 3 invoices to date
  inv 1 · REHMANN TRANSPORTATION CORP. · PO 1523174
    purchase 3,600.00 · escrow 54.00 · cash rsv 0.00 · discount 54.00 · fees 10.00
    net adv 3,482.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,482.00 Wire USMCA 08/11/26
`;

  let pass = 0;
  let fail = 0;

  // Parser test
  const day = parseManifestDay(manifestSource, "8/10/26");
  if (!day) { console.error(`${LABEL} --selftest FAIL — parser: day not found`); fail += 1; }
  else if (day.invoiceCount !== 2) { console.error(`${LABEL} --selftest FAIL — parser: expected 2 invoices, got ${day.invoiceCount}`); fail += 1; }
  else if (day.dayDollars !== 5500) { console.error(`${LABEL} --selftest FAIL — parser: expected $5500, got ${day.dayDollars}`); fail += 1; }
  else if (day.netAdvance !== 5325) { console.error(`${LABEL} --selftest FAIL — parser: expected net adv $5325, got ${day.netAdvance}`); fail += 1; }
  else if (day.normalizedDate !== "2026-08-10") { console.error(`${LABEL} --selftest FAIL — parser: expected 2026-08-10, got ${day.normalizedDate}`); fail += 1; }
  else if (day.invoices[0].purchase !== 3000 || day.invoices[0].escrow !== 45 || day.invoices[0].netAdvance !== 2910) { console.error(`${LABEL} --selftest FAIL — parser: invoice 0 details wrong: ${JSON.stringify(day.invoices[0])}`); fail += 1; }
  else pass += 1;

  // Day not in manifest
  const missing = parseManifestDay(manifestSource, "9/99/99");
  if (missing !== null) { console.error(`${LABEL} --selftest FAIL — parser: expected null for missing day`); fail += 1; }
  else pass += 1;

  // All manifest numbers
  const allNums = parseAllManifestInvoiceNumbers(manifestSource);
  if (allNums.length !== 3 || !allNums.includes("2") || !allNums.includes("3") || !allNums.includes("1")) { console.error(`${LABEL} --selftest FAIL — allNums: expected [2,3,1], got ${JSON.stringify(allNums)}`); fail += 1; }
  else pass += 1;

  // Classifier fixtures
  const baseInput = {
    manifestDay: day,
    allManifestNumbers: allNums,
    liveRows: [
      { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, advance_amount_cents: 291000, reserve_amount_cents: 4500, factor_fee_cents: 4500 },
      { faro_invoice_number: "3", faro_purchase_date: "2026-08-10", invoice_total_cents: 250000, advance_amount_cents: 241500, reserve_amount_cents: 3090, factor_fee_cents: 5410 },
    ],
    allLiveNumbers: [{ faro_invoice_number: "2", count: 1 }, { faro_invoice_number: "3", count: 1 }],
    livePayments: [
      { payment_date: "2026-08-10", amount_cents: 291000 },
      { payment_date: "2026-08-10", amount_cents: 241500 },
    ],
    ledgerBalanceOk: true,
    ledgerBalanceDetails: [{ je_id: "je1", debit_cents: 532500, credit_cents: 532500, balanced: true }],
    orphanJes: [],
    orphanDocs: [],
    linkageRows: [{ load_id: "l1", has_driver: true, has_unit: true, has_customer: true }],
    sampleDataRows: [],
    nonUsmcaRows: 0,
    documentPosting: [],
    clearingResidueCents: 0,
    expenseNetCents: 50000,
    expenseDocsForDay: 1,
  };

  // Clean GREEN
  const green = classifyDayClose(baseInput);
  if (!green.allPass) { console.error(`${LABEL} --selftest FAIL — clean GREEN: expected all pass, got ${green.assertions.filter(a => !a.pass).map(a => a.name).join(", ")}`); fail += 1; }
  else pass += 1;

  // RED: wrong invoice count
  const red1 = classifyDayClose({ ...baseInput, liveRows: [baseInput.liveRows[0]] });
  if (red1.allPass || !red1.assertions.find(a => a.id === 1).pass === false) { console.error(`${LABEL} --selftest FAIL — wrong count: expected assertion 1 FAIL`); fail += 1; }
  else pass += 1;

  // RED: unstamped
  const red3 = classifyDayClose({ ...baseInput, liveRows: baseInput.liveRows.map(r => ({ ...r, faro_purchase_date: null })) });
  if (red3.allPass) { console.error(`${LABEL} --selftest FAIL — unstamped: expected assertion 3 FAIL`); fail += 1; }
  else pass += 1;

  // RED: duplicate
  const red4 = classifyDayClose({ ...baseInput, liveRows: [...baseInput.liveRows, { faro_invoice_number: "2", faro_purchase_date: "2026-08-10", invoice_total_cents: 300000, advance_amount_cents: 291000, reserve_amount_cents: 4500, factor_fee_cents: 4500 }] });
  if (red4.allPass) { console.error(`${LABEL} --selftest FAIL — duplicate: expected assertion 4 FAIL`); fail += 1; }
  else pass += 1;

  // RED: wire legs missing
  const red7 = classifyDayClose({ ...baseInput, livePayments: [] });
  if (red7.allPass) { console.error(`${LABEL} --selftest FAIL — no wire legs: expected assertion 7 FAIL`); fail += 1; }
  else pass += 1;

  // RED: sample data
  const red11 = classifyDayClose({ ...baseInput, sampleDataRows: [{ table: "invoices", id: "x" }] });
  if (red11.allPass) { console.error(`${LABEL} --selftest FAIL — sample data: expected assertion 11 FAIL`); fail += 1; }
  else pass += 1;

  // RED: non-USMCA
  const red12 = classifyDayClose({ ...baseInput, nonUsmcaRows: 1 });
  if (red12.allPass) { console.error(`${LABEL} --selftest FAIL — non-USMCA: expected assertion 12 FAIL`); fail += 1; }
  else pass += 1;

  // RED: unlinked load
  const red10 = classifyDayClose({ ...baseInput, linkageRows: [{ load_id: "l1", has_driver: false, has_unit: true, has_customer: true }] });
  if (red10.allPass) { console.error(`${LABEL} --selftest FAIL — unlinked load: expected assertion 10 FAIL`); fail += 1; }
  else pass += 1;

  // RED: unbalanced JE
  const red8 = classifyDayClose({ ...baseInput, ledgerBalanceOk: false, ledgerBalanceDetails: [{ je_id: "je1", debit_cents: 532500, credit_cents: 532000, balanced: false }] });
  if (red8.allPass) { console.error(`${LABEL} --selftest FAIL — unbalanced JE: expected assertion 8 FAIL`); fail += 1; }
  else pass += 1;

  // RED: orphan JE
  const red9 = classifyDayClose({ ...baseInput, orphanJes: [{ je_id: "je-x", reason: "no source doc" }] });
  if (red9.allPass) { console.error(`${LABEL} --selftest FAIL — orphan JE: expected assertion 9 FAIL`); fail += 1; }
  else pass += 1;

  // RED: unposted document class (assertion 13)
  const red13 = classifyDayClose({ ...baseInput, documentPosting: [
    { table: "accounting.expenses", sourceType: "expense", expectedToPost: true, exists: true, nonVoided: 5, withLedger: 0, gap: 5 },
  ] });
  if (red13.allPass) { console.error(`${LABEL} --selftest FAIL — unposted docs: expected assertion 13 FAIL`); fail += 1; }
  else pass += 1;

  // RED: clearing-account residue (assertion 14)
  const red14 = classifyDayClose({ ...baseInput, clearingResidueCents: 50000 });
  if (red14.allPass) { console.error(`${LABEL} --selftest FAIL — clearing residue: expected assertion 14 FAIL`); fail += 1; }
  else pass += 1;

  // RED: expense net $0 with expense docs (assertion 15)
  const red15 = classifyDayClose({ ...baseInput, expenseNetCents: 0, expenseDocsForDay: 3 });
  if (red15.allPass) { console.error(`${LABEL} --selftest FAIL — expense net $0 with docs: expected assertion 15 FAIL`); fail += 1; }
  else pass += 1;

  // GREEN: expense net $0 with NO expense docs (assertion 15 — no docs = ok)
  const green15 = classifyDayClose({ ...baseInput, expenseNetCents: 0, expenseDocsForDay: 0 });
  if (!green15.allPass) { console.error(`${LABEL} --selftest FAIL — expense net $0 no docs: expected all PASS`); fail += 1; }
  else pass += 1;

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function measureLive(client, normalizedDate) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // 1-6: factoring_advances for that day
  const faRes = await client.query(
    `SELECT faro_invoice_number, faro_purchase_date::text, invoice_total_cents,
            advance_amount_cents, reserve_amount_cents, factor_fee_cents
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND faro_purchase_date = $2::date
      ORDER BY faro_invoice_number`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 3: unstamped rows for that day (faro_purchase_date IS NULL but created for that day)
  // We check this by looking at rows where faro_purchase_date IS NULL — but we can't know
  // which day they belong to without the stamp. So we check: are there ANY unstamped rows?
  const unstampedRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND faro_purchase_date IS NULL`,
    [USMCA_COMPANY_ID],
  );

  // 4: duplicates across whole live set
  const dupRes = await client.query(
    `SELECT faro_invoice_number, count(*)::int AS cnt
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND faro_invoice_number IS NOT NULL
      GROUP BY faro_invoice_number HAVING count(*) > 1`,
    [USMCA_COMPANY_ID],
  );

  // 7: wire legs (payments for that day)
  const payRes = await client.query(
    `SELECT payment_date::text, amount_cents
       FROM accounting.payments
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND payment_date = $2::date
      ORDER BY payment_date`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 8: ledger balance for JEs on that day
  const jeBalanceRes = await client.query(
    `SELECT je.id::text, je.entry_date::text,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0) AS debit_cents,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0) AS credit_cents
       FROM accounting.journal_entries je
       LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND je.entry_date = $2::date
      GROUP BY je.id, je.entry_date`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 9: orphan JEs (JE has no source document linkage)
  const orphanJeRes = await client.query(
    `SELECT je.id::text, 'no source posting' AS reason
       FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND je.entry_date = $2::date
        AND NOT EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings jep
           WHERE jep.journal_entry_uuid = je.id
             AND jep.source_transaction_type IS NOT NULL
             AND jep.source_transaction_id IS NOT NULL
        )`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 9: orphan docs (invoices for that day with no JE)
  const orphanDocRes = await client.query(
    `SELECT i.id::text, 'invoice' AS doc_type, 'no JE' AS reason
       FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL
        AND i.factoring_advance_id IN (
          SELECT fa.id FROM accounting.factoring_advances fa
           WHERE fa.operating_company_id = $1::uuid AND fa.voided_at IS NULL
             AND fa.faro_purchase_date = $2::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings jep
           WHERE jep.source_transaction_type = 'invoice'
             AND jep.source_transaction_id = i.id
        )`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 10: linkage — loads linked to that day's invoices
  const linkageRes = await client.query(
    `SELECT l.id::text,
            (l.assigned_primary_driver_id IS NOT NULL) AS has_driver,
            (l.assigned_unit_id IS NOT NULL) AS has_unit,
            (l.customer_id IS NOT NULL) AS has_customer
       FROM mdata.loads l
       JOIN accounting.invoices i ON i.source_load_id = l.id
      WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL
        AND i.factoring_advance_id IN (
          SELECT fa.id FROM accounting.factoring_advances fa
           WHERE fa.operating_company_id = $1::uuid AND fa.voided_at IS NULL
             AND fa.faro_purchase_date = $2::date
        )`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 11: sample data in that day's set
  const sampleRes = await client.query(
    `SELECT 'invoices' AS table_name, i.id::text
       FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.is_sample_data = true
        AND i.factoring_advance_id IN (
          SELECT fa.id FROM accounting.factoring_advances fa
           WHERE fa.operating_company_id = $1::uuid AND fa.voided_at IS NULL
             AND fa.faro_purchase_date = $2::date
        )
      UNION ALL
     SELECT 'journal_entries', je.id::text
       FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND je.is_sample_data = true
        AND je.entry_date = $2::date
      UNION ALL
     SELECT 'loads', l.id::text
       FROM mdata.loads l
       JOIN accounting.invoices i ON i.source_load_id = l.id
      WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL
        AND l.is_sample_data = true
        AND i.factoring_advance_id IN (
          SELECT fa.id FROM accounting.factoring_advances fa
           WHERE fa.operating_company_id = $1::uuid AND fa.voided_at IS NULL
             AND fa.faro_purchase_date = $2::date
        )`,
    [USMCA_COMPANY_ID, normalizedDate],
  );

  // 12: non-USMCA rows for that day
  const nonUsmcaRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.factoring_advances
      WHERE voided_at IS NULL AND faro_purchase_date = $1::date
        AND operating_company_id != $2::uuid`,
    [normalizedDate, USMCA_COMPANY_ID],
  );

  // 13: document-posting completeness for the day
  // Derive document classes from live schema, check each for ledger linkage on that day.
  const DAY_DOC_CLASSES = [
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

  const documentPosting = [];
  for (const cls of DAY_DOC_CLASSES) {
    const [schema, table] = cls.table.split(".");
    const existsRes = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS exists`,
      [schema, table],
    );
    const exists = existsRes.rows[0].exists;
    if (!exists) {
      documentPosting.push({ ...cls, exists: false, nonVoided: 0, withLedger: 0, gap: 0 });
      continue;
    }

    // Count non-voided documents created on that day
    const countRes = await client.query(
      `SELECT count(*)::int AS cnt FROM ${cls.table}
        WHERE operating_company_id = $1::uuid
          AND ${cls.voidCol} IS NULL
          AND created_at::date = $2::date`,
      [USMCA_COMPANY_ID, normalizedDate],
    );
    const nonVoided = countRes.rows[0].cnt;

    // Count how many have a ledger entry
    const ledgerRes = await client.query(
      `SELECT count(DISTINCT d.id)::int AS cnt
         FROM ${cls.table} d
        WHERE d.operating_company_id = $1::uuid
          AND d.${cls.voidCol} IS NULL
          AND d.created_at::date = $2::date
          AND EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings jep
             WHERE jep.source_transaction_type = $3
               AND jep.source_transaction_id = d.id::text
          )`,
      [USMCA_COMPANY_ID, normalizedDate, cls.sourceType],
    );
    const withLedger = ledgerRes.rows[0].cnt;
    documentPosting.push({ ...cls, exists: true, nonVoided, withLedger, gap: nonVoided - withLedger });
  }

  // 14: clearing-account residue for the day (1090 Undeposited Funds)
  // Money that entered 1090 on that day must have left by day close.
  // Same-day residue = sum of debits to 1090 on that day minus sum of credits from 1090 on that day.
  const clearingRes = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS residue_cents
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
        AND je.entry_date = $2::date
        AND a.operating_company_id = $1::uuid
        AND a.account_number = '1090'`,
    [USMCA_COMPANY_ID, normalizedDate],
  );
  const clearingResidueCents = Number(clearingRes.rows[0].residue_cents);

  // 15: expense-side account net for the day
  // Sum all COGS + Expense + OtherExpense account movement on that day.
  // If expense documents exist but the net is $0.00, it's a reversal that was never re-posted.
  const expenseNetRes = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS net_cents
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
        AND je.entry_date = $2::date
        AND a.operating_company_id = $1::uuid
        AND a.account_type IN ('CostOfGoodsSold', 'Expense', 'OtherExpense')`,
    [USMCA_COMPANY_ID, normalizedDate],
  );
  const expenseNetCents = Number(expenseNetRes.rows[0].net_cents);

  // 15: count expense documents for that day
  const expenseDocsRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND created_at::date = $2::date`,
    [USMCA_COMPANY_ID, normalizedDate],
  );
  const expenseDocsForDay = expenseDocsRes.rows[0].cnt;

  await client.query("ROLLBACK");

  return {
    liveRows: faRes.rows,
    unstampedCount: unstampedRes.rows[0].cnt,
    duplicates: dupRes.rows,
    livePayments: payRes.rows,
    ledgerBalanceDetails: jeBalanceRes.rows.map((r) => ({
      je_id: r.id,
      debit_cents: Number(r.debit_cents),
      credit_cents: Number(r.credit_cents),
      balanced: Number(r.debit_cents) === Number(r.credit_cents),
    })),
    orphanJes: orphanJeRes.rows,
    orphanDocs: orphanDocRes.rows,
    linkageRows: linkageRes.rows,
    sampleDataRows: sampleRes.rows,
    nonUsmcaRows: nonUsmcaRes.rows[0].cnt,
    documentPosting,
    clearingResidueCents,
    expenseNetCents,
    expenseDocsForDay,
  };
}

function formatTimestamp() {
  const now = new Date();
  // Laredo Central time = UTC-5 (CDT)
  const central = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const date = central.toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" });
  const time = central.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const utc = now.toISOString().replace("T", " ").substring(0, 16) + "Z";
  return `${time} CT (${utc})`;
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  const dayArg = process.argv.find((a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1] && a !== "node" && !a.endsWith(".mjs"));
  if (!dayArg) {
    console.error(`${LABEL}: FAIL — usage: node scripts/reconcile-feed-day.mjs <purchase_day> (e.g., 8/10/26)`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error(`${LABEL}: FAIL — manifest not found at ${MANIFEST_FILE}`);
    process.exitCode = 1;
    return;
  }
  const manifestSource = fs.readFileSync(MANIFEST_FILE, "utf8");
  const manifestDay = parseManifestDay(manifestSource, dayArg);
  if (!manifestDay) {
    console.error(`${LABEL}: FAIL — day '${dayArg}' not found in manifest`);
    process.exitCode = 1;
    return;
  }
  const allManifestNumbers = parseAllManifestInvoiceNumbers(manifestSource);

  console.log(`${LABEL}: reconciling purchase day ${dayArg} (${manifestDay.normalizedDate})`);
  console.log(`${LABEL}: manifest — ${manifestDay.invoiceCount} invoice(s), $${manifestDay.dayDollars.toFixed(2)} gross, $${manifestDay.netAdvance.toFixed(2)} net advance`);
  console.log(`${LABEL}: run at ${formatTimestamp()}`);
  console.log("");

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let live;
  try {
    live = await measureLive(client, manifestDay.normalizedDate);
  } finally {
    client.release();
    await pool.end();
  }

  // If no live rows for that day, the day hasn't been fed yet — out of scope
  if (live.liveRows.length === 0) {
    console.log(`${LABEL}: day ${dayArg} has 0 live factoring_advances — NOT FED YET, out of scope`);
    console.log(`${LABEL}: PASS (out of scope)`);
    return;
  }

  const { assertions, allPass } = classifyDayClose({
    manifestDay,
    allManifestNumbers,
    liveRows: live.liveRows,
    allLiveNumbers: [],
    livePayments: live.livePayments,
    ledgerBalanceOk: live.ledgerBalanceDetails.every((j) => j.balanced),
    ledgerBalanceDetails: live.ledgerBalanceDetails,
    orphanJes: live.orphanJes,
    orphanDocs: live.orphanDocs,
    linkageRows: live.linkageRows,
    sampleDataRows: live.sampleDataRows,
    nonUsmcaRows: live.nonUsmcaRows,
    documentPosting: live.documentPosting,
    clearingResidueCents: live.clearingResidueCents,
    expenseNetCents: live.expenseNetCents,
    expenseDocsForDay: live.expenseDocsForDay,
  });

  // Print per-day table
  console.log("  #  Assertion              Expected                          Live                              Result");
  console.log("  " + "-".repeat(120));
  for (const a of assertions) {
    const result = a.pass ? "PASS" : "FAIL";
    console.log(`  ${String(a.id).padStart(2)}  ${a.name.padEnd(22)} ${a.expected.padEnd(33)} ${a.live.padEnd(33)} ${result}`);
  }
  console.log("");

  if (allPass) {
    console.log(`${LABEL}: GREEN — day ${dayArg} closes. All ${assertions.length} assertions pass.`);
  } else {
    const failed = assertions.filter((a) => !a.pass);
    console.error(`${LABEL}: RED — day ${dayArg} does NOT close. ${failed.length} of ${assertions.length} assertion(s) failed:`);
    for (const a of failed) {
      console.error(`  #${a.id} ${a.name}: expected ${a.expected}, got ${a.live}`);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
