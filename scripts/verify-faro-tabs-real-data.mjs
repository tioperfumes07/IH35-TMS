#!/usr/bin/env node
/**
 * verify-faro-tabs-real-data.mjs
 *
 * FAC-09a (owner 2026-09-08, "CORRECTED FROM REAL SCREENSHOTS"): the real Faro debtor portal has
 * 15 nav items, in a specific order, and Reserve/Fees Paid/Purchase Report/Payments to You/
 * Aging/Account Summary must each render the exact column sets read off the real screenshots
 * (not a generic register). This guard is built incrementally, matching how the rebuild itself
 * ships: it locks the 15-item subnav (done) and the Aging report's real column set (done, this
 * pass — the other 5 real pages are tracked in REMAINING and get their own assertions added here
 * as each ships, never claimed done ahead of the actual build).
 *
 * WHAT IS ASSERTED (this pass):
 *  - All 15 named nav items exist in FactoringHome.tsx's SUBNAV, in the doc's own order.
 *  - The 5 pre-existing internal-ops tabs are NOT deleted (Rule 07) — still present, reachable
 *    via the "Internal Tools" dropdown.
 *  - The Aging tab renders the real column set (ID/Memos/Invoice/Debtor/PO/Other Ref/Inv Date/
 *    Due Date/Age/0-30/31-60/61-90/90+/Balance/Purchase) built on the recourse-pipeline data
 *    (no fabricated new data source), with a summary strip (Total Records + the 4 buckets +
 *    Total Balance).
 *  - The Account Summary tab is no longer a stub, and its real line items (Ending AR Balance,
 *    Reserve Balance, Fees Paid total, Other Adjustments) are wired to the already-fetched
 *    summaryQuery (views.factoring_summary) / feesQuery (views.factoring_chargebacks_fees
 *    monthly_summary) data — not a fabricated new source.
 *
 * Usage:
 *   node scripts/verify-faro-tabs-real-data.mjs            # scan
 *   node scripts/verify-faro-tabs-real-data.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-tabs-real-data";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

// The doc's own exact 15-item order.
const REQUIRED_NAV_ORDER = [
  "submit_invoice",
  "request_debtor_credit_check",
  "funds_due",
  "payments_to_you",
  "debtor_receipts",
  "purchase_report",
  "account_summary",
  "fees_paid",
  "aging",
  "reserve",
  "chargebacks_overpayments",
  "loan_save",
  "unapplied_cash",
  "invoice_status_report",
  "messages_support",
];

const INTERNAL_TOOLS_IDS = [
  "reserve_tracker",
  "recourse_pipeline",
  "chargebacks_fees",
  "statements_settings",
  "faro_imports",
  "equipment_loans",
  "vendor_merges",
];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkNavOrder(src) {
  const failures = [];
  const subnavMatch = src.match(/const SUBNAV = \[([\s\S]*?)\] as const;/);
  if (!subnavMatch) {
    failures.push(`${HOME}: could not find the SUBNAV array.`);
    return failures;
  }
  const ids = [...subnavMatch[1].matchAll(/\{\s*id:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  if (ids.length !== REQUIRED_NAV_ORDER.length) {
    failures.push(
      `${HOME}: SUBNAV has ${ids.length} items, expected exactly ${REQUIRED_NAV_ORDER.length} (the real portal's 15).`,
    );
  }
  for (let i = 0; i < REQUIRED_NAV_ORDER.length; i += 1) {
    if (ids[i] !== REQUIRED_NAV_ORDER[i]) {
      failures.push(
        `${HOME}: SUBNAV position ${i} is "${ids[i] ?? "(missing)"}", expected "${REQUIRED_NAV_ORDER[i]}" (doc's own real-portal order).`,
      );
    }
  }
  return failures;
}

export function checkInternalToolsPreserved(src) {
  const failures = [];
  const internalMatch = src.match(/const INTERNAL_TOOLS_SUBNAV = \[([\s\S]*?)\] as const;/);
  if (!internalMatch) {
    failures.push(`${HOME}: could not find INTERNAL_TOOLS_SUBNAV — Rule 07 regression, the 5 pre-existing tabs must not be deleted.`);
    return failures;
  }
  const ids = [...internalMatch[1].matchAll(/\{\s*id:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  for (const id of INTERNAL_TOOLS_IDS) {
    if (!ids.includes(id)) {
      failures.push(`${HOME}: Rule 07 regression — internal-ops tab "${id}" was removed instead of kept reachable.`);
    }
  }
  if (!/Internal Tools/.test(src)) {
    failures.push(`${HOME}: missing the "Internal Tools" dropdown wiring the preserved tabs into the nav.`);
  }
  return failures;
}

export function checkAgingReal(src) {
  const failures = [];
  const agingSection = src.split('tab === "aging"')[1]?.slice(0, 6000) ?? "";
  if (!agingSection) {
    failures.push(`${HOME}: could not find the aging tab block.`);
    return failures;
  }
  const requiredColumnLabels = [
    '"ID"', '"Memos"', '"Invoice"', '"Debtor"', '"PO"', '"Other Ref"', '"Inv Date"', '"Due Date"',
    '"Age"', '"0-30"', '"31-60"', '"61-90"', '"90+"', '"Balance"', '"Purchase"',
  ];
  for (const label of requiredColumnLabels) {
    if (!agingSection.includes(`label: ${label}`)) {
      failures.push(`${HOME}: aging table missing required column label ${label}.`);
    }
  }
  if (!/factoring-aging-total-records/.test(agingSection) ||
      !/factoring-aging-total-balance/.test(agingSection)) {
    failures.push(`${HOME}: aging summary strip missing Total Records / Total Balance.`);
  }
  if (!/recourseQuery\.data\?\.invoices|agingRows/.test(agingSection)) {
    failures.push(`${HOME}: aging report must be built on the real recourse-pipeline data (agingRows), not a fabricated source.`);
  }
  return failures;
}

export function checkAccountSummaryReal(src) {
  const failures = [];
  const stubMatch = src.match(/tab === "request_debtor_credit_check"[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /tab === "account_summary"/.test(stubMatch[0])) {
    failures.push(`${HOME}: Account Summary is still routed through the generic honest-stub block — must have its own real section (FAC-09a).`);
  }
  const marker = 'tab === "account_summary" ?';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    failures.push(`${HOME}: could not find a dedicated Account Summary ("tab === \"account_summary\" ?") block.`);
    return failures;
  }
  const section = src.slice(idx, idx + 8000);
  const requiredRealBindings = [
    { pattern: /summary\?\.outstanding_liability_balance/, label: "Ending AR Balance bound to summary.outstanding_liability_balance" },
    { pattern: /summary\?\.reserve_balance/, label: "Reserve Balance bound to summary.reserve_balance" },
    { pattern: /latestMonth\?\.factor_fee_total/, label: "Fees Paid total bound to feesQuery monthly_summary factor_fee_total" },
    { pattern: /latestMonth\?\.chargeback_total/, label: "Other Adjustments bound to feesQuery monthly_summary chargeback_total" },
  ];
  for (const { pattern, label } of requiredRealBindings) {
    if (!pattern.test(section)) {
      failures.push(`${HOME}: Account Summary missing real binding — ${label}.`);
    }
  }
  const requiredTestIds = [
    "factoring-account-summary-ending-balance",
    "factoring-account-summary-reserve-balance",
    "factoring-account-summary-fees-total",
    "factoring-account-summary-adjustments",
  ];
  for (const testId of requiredTestIds) {
    if (!section.includes(testId)) {
      failures.push(`${HOME}: Account Summary missing required data-testid="${testId}".`);
    }
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(HOME);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkNavOrder(src));
  failures.push(...checkInternalToolsPreserved(src));
  failures.push(...checkAgingReal(src));
  failures.push(...checkAccountSummaryReal(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const idsBlock = REQUIRED_NAV_ORDER.map((id) => `  { id: "${id}", label: "x" },`).join("\n");
  const internalBlock = INTERNAL_TOOLS_IDS.map((id) => `  { id: "${id}", label: "x" },`).join("\n");
  const agingBlock = `
    tab === "aging" ? (
      <ParityTable
        columns={[
          { key: "id", label: "ID" },
          { key: "memos", label: "Memos" },
          { key: "invoice", label: "Invoice" },
          { key: "debtor", label: "Debtor" },
          { key: "po", label: "PO" },
          { key: "other_ref", label: "Other Ref" },
          { key: "inv_date", label: "Inv Date" },
          { key: "due_date", label: "Due Date" },
          { key: "age", label: "Age" },
          { key: "b1", label: "0-30" },
          { key: "b2", label: "31-60" },
          { key: "b3", label: "61-90" },
          { key: "b4", label: "90+" },
          { key: "balance", label: "Balance" },
          { key: "purchased", label: "Purchase" },
        ]}
        rows={agingRows}
      />
      <div data-testid="factoring-aging-total-records" />
      <div data-testid="factoring-aging-total-balance" />
    ) : null
  `;
  const stubBlock = `
      {tab === "request_debtor_credit_check" ||
      tab === "funds_due" ||
      tab === "payments_to_you" ||
      tab === "fees_paid" ? (
        <div data-testid={\`factoring-stub-\${tab}\`}>stub</div>
      ) : null}
  `;
  const accountSummaryBlock = `
      {tab === "account_summary" ? (
        <div data-testid="factoring-account-summary">
          <span data-testid="factoring-account-summary-ending-balance">{fmtCurrency(summary?.outstanding_liability_balance)}</span>
          <span data-testid="factoring-account-summary-reserve-balance">{fmtCurrency(summary?.reserve_balance)}</span>
          <span data-testid="factoring-account-summary-fees-total">{fmtCurrency(latestMonth?.factor_fee_total)}</span>
          <span data-testid="factoring-account-summary-adjustments">{fmtCurrency(latestMonth?.chargeback_total)}</span>
        </div>
      ) : null}
  `;
  const goodSrc = `
const SUBNAV = [
${idsBlock}
] as const;
const INTERNAL_TOOLS_SUBNAV = [
${internalBlock}
] as const;
Internal Tools
${stubBlock}
${accountSummaryBlock}
${agingBlock}
  `;
  const badWrongOrder = goodSrc.replace('{ id: "aging", label: "x" },', '{ id: "zzz", label: "x" },');
  const badDeletedInternal = goodSrc.replace('{ id: "vendor_merges", label: "x" },', "");
  const badAgingMissingColumn = goodSrc.replace('{ key: "b4", label: "90+" },', "");
  const badAccountSummaryStillStub = goodSrc.replace(
    'tab === "payments_to_you" ||\n      tab === "fees_paid" ? (',
    'tab === "payments_to_you" ||\n      tab === "account_summary" ||\n      tab === "fees_paid" ? (',
  );
  const badAccountSummaryFakeBinding = goodSrc.replace(
    'data-testid="factoring-account-summary-reserve-balance">{fmtCurrency(summary?.reserve_balance)}</span>',
    'data-testid="factoring-account-summary-reserve-balance">{fmtCurrency(9999)}</span>',
  );

  const checks = [
    ["clean source passes", checkNavOrder(goodSrc).length === 0 && checkInternalToolsPreserved(goodSrc).length === 0 && checkAgingReal(goodSrc).length === 0 && checkAccountSummaryReal(goodSrc).length === 0],
    ["wrong nav order fails", checkNavOrder(badWrongOrder).length > 0],
    ["deleted internal tab fails", checkInternalToolsPreserved(badDeletedInternal).length > 0],
    ["missing aging column fails", checkAgingReal(badAgingMissingColumn).length > 0],
    ["account summary still stub fails", checkAccountSummaryReal(badAccountSummaryStillStub).length > 0],
    ["account summary fake binding fails", checkAccountSummaryReal(badAccountSummaryFakeBinding).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — 15-item real nav order locked, internal-ops tabs preserved (Rule 07), Aging + Account Summary reports real (FAC-09a)`);
process.exit(0);
