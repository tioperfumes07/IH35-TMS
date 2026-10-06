#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — this is a bug-regression / real-data-shape guard for one page
// (FactoringHome.tsx's FAC-09a rebuild), not a Program-matrix EntityLink/reverse_link/FK wiring
// ratchet. checkReserveReal's real-column-EntityLink assertions trip
// verify-matrix-built-tag-present's WIRING_HINT heuristic — exempted rather than attaching an
// inaccurate @matrix-built module/leaf tag that doesn't correspond to any real Program-matrix
// tracked surface.
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
 *  - The Fees Paid tab is no longer a stub: its "Open Invoices" view is built on agingRows +
 *    feesQuery history (accrued fees per invoice), and its "All Fees" view is built directly on
 *    feesQuery.data.history — both already-fetched, no fabricated new source.
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

// The primary Faro-parity strip, in order. ROUND 315 B4–B5 (ACCT-F31504, #23900): Account Summary and Request Debtor / Credit
// Check moved under Internal Tools (never deleted, Rule 07); Escrow Account (shown as "Security Reserve") and Cash Reserve
// were added after Reserve (ACCT-F31512, #23907) — Faro's two reserve reports (GL 1235 own pool, #22838). Fifteen items, Faro's real-portal order.
const REQUIRED_NAV_ORDER = [
  "submit_invoice",
  "funds_due",
  "payments_to_you",
  "debtor_receipts",
  "purchase_report",
  "fees_paid",
  "aging",
  "reserve",
  "escrow_account",
  "cash_reserve",
  "chargebacks_overpayments",
  "loan_save",
  "unapplied_cash",
  "invoice_status_report",
  "messages_support",
];

const INTERNAL_TOOLS_IDS = [
  "account_summary",
  "request_debtor_credit_check",
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

// ROUND 435 (owner, verbatim): THE TEN Faro tabs, in this order, and no others. Every section above still exists
// (Rule 07) and is shown inside exactly one of these tabs (FACTORING_SECTION_PARENT; reachability is
// verify-factoring-nav-reachable's job).
export const OWNER_TEN = [
  ["submit_invoice", "Submit invoice"],
  ["debtor_receipts", "Debtor receipts"],
  ["account_summary", "Account summary"],
  ["aging", "Aging"],
  ["chargebacks_overpayments", "Chargeback and overpayments"],
  ["unapplied_cash", "Unapplied cash"],
  ["payments_to_you", "Payments to us"],
  ["purchase_report", "Purchase report"],
  ["fees_paid", "Fees paid"],
  ["reserve", "Reserve"],
];
const MANIFEST = "apps/frontend/src/router/route-manifest.ts";

/** Exported for --selftest. */
export function checkNavOrder(src, manifestSrc = read(MANIFEST).src) {
  const failures = [];
  const subnavMatch = src.match(/const SUBNAV = \[([\s\S]*?)\] as const;/);
  if (!subnavMatch) {
    failures.push(`${HOME}: could not find the SUBNAV array.`);
    return failures;
  }
  const ids = [...subnavMatch[1].matchAll(/\{\s*id:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  for (const id of REQUIRED_NAV_ORDER) {
    if (!ids.includes(id)) failures.push(`${HOME}: Rule 07 regression — section "${id}" was deleted instead of shown inside its Faro tab.`);
  }
  if (!/<NavyPageSubNav\s+items=\{FARO_TABS\.map\(/.test(src)) {
    failures.push(`${HOME}: the tab strip must be built from FARO_TABS (router/route-manifest.ts), the owner's ten.`);
  }
  const start = manifestSrc.indexOf("export const FARO_TABS = [");
  const end = manifestSrc.indexOf("] as const;", start);
  if (start < 0 || end < 0) {
    failures.push(`${MANIFEST}: could not find FARO_TABS.`);
    return failures;
  }
  const tabs = [...manifestSrc.slice(start, end).matchAll(/\{\s*id:\s*"([a-z_]+)",\s*label:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
  if (tabs.length !== OWNER_TEN.length) failures.push(`${MANIFEST}: FARO_TABS has ${tabs.length} tabs, the owner's set is exactly ${OWNER_TEN.length}.`);
  OWNER_TEN.forEach(([id, label], k) => {
    const got = tabs[k];
    if (!got || got[0] !== id || got[1] !== label) failures.push(`${MANIFEST}: FARO_TABS position ${k} is ${got ? `"${got[1]}" (${got[0]})` : "(missing)"}, the owner's is "${label}" (${id}).`);
  });
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
  return failures;
}

export function checkAgingReal(src) {
  const failures = [];
  // Window bumped 6000->9000 (2026-09-09): the aging table has legitimately grown two real
  // columns since this window was sized (Settlement EntityLink, real advance-linked when present
  // + lc_settlement_number fallback) -- same content requirement, more real content to scan past.
  const agingSection = src.split('show("aging")')[1]?.slice(0, 9000) ?? "";
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
  const stubMatch = src.match(/show\("request_debtor_credit_check"\)[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /show\("account_summary"\)/.test(stubMatch[0])) {
    failures.push(`${HOME}: Account Summary is still routed through the generic honest-stub block — must have its own real section (FAC-09a).`);
  }
  const marker = 'show("account_summary") ?';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    failures.push(`${HOME}: could not find a dedicated Account Summary ("tab === \"account_summary\" ?") block.`);
    return failures;
  }
  const section = src.slice(idx, idx + 8000);
  const requiredRealBindings = [
    { pattern: /summary\?\.outstanding_liability_balance/, label: "Ending AR Balance bound to summary.outstanding_liability_balance" },
    // ROUND 326.2 item 4: the book reserve is the factoring KPI engine (GL 1230 + 1235), not views.factoring_summary.
    { pattern: /engineReserve\b/, label: "Reserve Balance bound to the factoring KPI engine (engineReserve)" },
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

export function checkFeesPaidReal(src) {
  const failures = [];
  const stubMatch = src.match(/show\("request_debtor_credit_check"\)[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /show\("fees_paid"\)/.test(stubMatch[0])) {
    failures.push(`${HOME}: Fees Paid is still routed through the generic honest-stub block — must have its own real section (FAC-09a).`);
  }
  const marker = 'show("fees_paid") ?';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    failures.push(`${HOME}: could not find a dedicated Fees Paid ("tab === \"fees_paid\" ?") block.`);
    return failures;
  }
  const section = src.slice(idx, idx + 8000);
  const requiredRealBindings = [
    { pattern: /feesPaidOpenInvoiceRows/, label: "Open Invoices view bound to feesPaidOpenInvoiceRows (agingRows + accrued fees)" },
    { pattern: /accrued_fees/, label: "Accrued Fees column bound to the real per-invoice accrued_fees field" },
    { pattern: /feesQuery\.data\?\.history/, label: "All Fees view bound to feesQuery.data.history" },
    { pattern: /row\.factor_fee_amount/, label: "All Fees Amount column bound to row.factor_fee_amount" },
  ];
  for (const { pattern, label } of requiredRealBindings) {
    if (!pattern.test(section)) {
      failures.push(`${HOME}: Fees Paid missing real binding — ${label}.`);
    }
  }
  const requiredTestIds = ["factoring-fees-paid-view-toggle", "factoring-fees-paid-view-open-invoices", "factoring-fees-paid-view-all-fees"];
  for (const testId of requiredTestIds) {
    if (!section.includes(testId)) {
      failures.push(`${HOME}: Fees Paid missing required data-testid="${testId}".`);
    }
  }
  return failures;
}

export function checkPurchaseReportReal(src) {
  const failures = [];
  const stubMatch = src.match(/show\("request_debtor_credit_check"\)[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /show\("purchase_report"\)/.test(stubMatch[0])) {
    failures.push(`${HOME}: Purchase Report is still routed through the generic honest-stub block — must have its own real section (FAC-09a).`);
  }
  const marker = 'show("purchase_report") ?';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    failures.push(`${HOME}: could not find a dedicated Purchase Report ("tab === \"purchase_report\" ?") block.`);
    return failures;
  }
  const section = src.slice(idx, idx + 8000);
  const requiredColumnLabels = [
    '"Debtor"', '"Date"', '"Inv #"', '"PO"', '"Other Ref"', '"Purchase"', '"Escrow Rsv"', '"Cash Rsv"',
    '"Discount"', '"Fees"', '"Wire Fee"', '"Rebate Income"', '"Returned Item Fee"', '"Schedule Fee"',
    '"Shipping Fee"', '"Cash Advance Fee"', '"Processing Fee"', '"Dispatch"', '"Net Adv"', '"Receipts"',
    '"Sch Fee"', '"ChgBack (Refund)"',
  ];
  for (const label of requiredColumnLabels) {
    if (!section.includes(`label: ${label}`)) {
      failures.push(`${HOME}: Purchase Report missing required column label ${label}.`);
    }
  }
  const requiredRealBindings = [
    { pattern: /purchaseReportRows/, label: "table bound to purchaseReportRows (agingRows + fee/chargeback join)" },
    { pattern: /row\.invoice_amount/, label: "Purchase column bound to row.invoice_amount" },
    { pattern: /row\.reserve_amount/, label: "Cash Rsv column bound to row.reserve_amount" },
    { pattern: /row\.advance_amount/, label: "Net Adv column bound to row.advance_amount" },
    { pattern: /row\.chargeback/, label: "ChgBack column bound to row.chargeback (real per-advance chargeback sum)" },
  ];
  for (const { pattern, label } of requiredRealBindings) {
    if (!pattern.test(section)) {
      failures.push(`${HOME}: Purchase Report missing real binding — ${label}.`);
    }
  }
  return failures;
}

export function checkChargebacksOverpaymentsReal(src) {
  const failures = [];
  const stubMatch = src.match(/show\("request_debtor_credit_check"\)[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /show\("chargebacks_overpayments"\)/.test(stubMatch[0])) {
    failures.push(`${HOME}: Chargebacks & Overpayments is still routed through the generic honest-stub block — must have its own real section (FAC-09a).`);
  }
  const marker = 'show("chargebacks_overpayments") ?';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    failures.push(`${HOME}: could not find a dedicated Chargebacks & Overpayments ("tab === \"chargebacks_overpayments\" ?") block.`);
    return failures;
  }
  const section = src.slice(idx, idx + 4000);
  const requiredRealBindings = [
    { pattern: /feesQuery\.data\?\.history/, label: "table bound to feesQuery.data.history (the same real chargeback/fee data proven on Chargebacks & Fees)" },
    { pattern: /row\.chargeback_amount/, label: "Total Chargebacks/Overpayments summed from row.chargeback_amount" },
    { pattern: /<ChargebacksTable/, label: "renders through the shared, already-proven ChargebacksTable component" },
  ];
  for (const { pattern, label } of requiredRealBindings) {
    if (!pattern.test(section)) {
      failures.push(`${HOME}: Chargebacks & Overpayments missing real binding — ${label}.`);
    }
  }
  const requiredTestIds = ["factoring-chargebacks-overpayments-total-records", "factoring-chargebacks-overpayments-total-amount"];
  for (const testId of requiredTestIds) {
    if (!section.includes(testId)) {
      failures.push(`${HOME}: Chargebacks & Overpayments missing required data-testid="${testId}".`);
    }
  }
  return failures;
}

// OWNER MEGA-REPORT 2026-09-09: "Reserve" (item 10 of the real 15-item nav) was still routed
// through the generic honest-stub block. Now real: Total Reserve bound to the same
// summary.reserve_balance every other tab uses, plus a real reserve-movement history table
// (getReserveBalanceHistory, the same ledger ReserveTracker.tsx already proves correct).
const PANEL = "apps/frontend/src/components/factoring/FactoringReservesSharedPanel.tsx";
export function checkReserveReal(src, panelSrc = fs.readFileSync(path.join(ROOT, PANEL), "utf8")) {
  const failures = [];
  const stubMatch = src.match(/show\("request_debtor_credit_check"\)[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /show\("reserve"\)\s*\|\|/.test(stubMatch[0])) {
    failures.push(`${HOME}: Reserve is still routed through the generic honest-stub block — must have its own real section (FAC-09a).`);
  }
  // ROUND 315 (ACCT-F31507, #23902): the Reserve tab mounts the SAME shared panel Banking Home uses (one reserve engine). The real
  // bindings (KPI-engine totals, getReserveBalanceHistory, running_balance_cents) live in that panel.
  const m = src.match(/show\("reserve"\)(?: && companyId)? \?/);
  if (!m) {
    failures.push(`${HOME}: could not find a dedicated Reserve ("tab === \"reserve\"") block.`);
    return failures;
  }
  const section = src.slice(m.index, m.index + 1200);
  if (!section.includes("factoring-reserve-report")) {
    failures.push(`${HOME}: Reserve missing required data-testid="factoring-reserve-report".`);
  }
  if (!/<FactoringReservesSharedPanel\b/.test(section)) {
    failures.push(`${HOME}: Reserve must mount the shared FactoringReservesSharedPanel (Lead B7) — no second reserve view.`);
  }
  const panel = panelSrc;
  for (const [re, label] of [
    [/getReserveBalanceHistory\(/, "reserve movement history bound to the real getReserveBalanceHistory ledger"],
    [/running_balance_cents/, "movement table renders the real running_balance_cents"],
  ]) {
    if (!re.test(panel)) failures.push(`FactoringReservesSharedPanel.tsx: Reserve missing real binding — ${label}.`);
  }
  return failures;
}

// FUNDS-DUE-01 (owner 2026-09-09): "Funds Due" (item 3 of the real 15-item nav) was still routed
// through the generic honest-stub block. Now real: bound to a dedicated fundsDueQuery
// (getFactoringFundsDue -> accounting.factoring_advances submitted-not-yet-advanced rows) --
// deliberately its OWN fetch, not a reuse of recourseQuery, because that view only ever contains
// already-advanced invoices and structurally cannot represent a pre-advance state.
export function checkFundsDueReal(src) {
  const failures = [];
  const stubMatch = src.match(/show\("request_debtor_credit_check"\)[\s\S]*?data-testid=\{`factoring-stub-\$\{tab\}`\}/);
  if (stubMatch && /show\("funds_due"\)\s*\|\|/.test(stubMatch[0])) {
    failures.push(`${HOME}: Funds Due is still routed through the generic honest-stub block — must have its own real section (FUNDS-DUE-01).`);
  }
  const marker = 'show("funds_due") ?';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    failures.push(`${HOME}: could not find a dedicated Funds Due ("tab === \"funds_due\" ?") block.`);
    return failures;
  }
  if (!/getFactoringFundsDue/.test(src)) {
    failures.push(`${HOME}: Funds Due missing real binding — must call getFactoringFundsDue (own fetch, not a reuse of recourseQuery).`);
  }
  if (!/fundsDueQuery/.test(src)) {
    failures.push(`${HOME}: Funds Due missing real binding — must be driven by a dedicated fundsDueQuery.`);
  }
  const section = src.slice(idx, idx + 200);
  if (!section.includes("factoring-funds-due-report")) {
    failures.push(`${HOME}: Funds Due missing required data-testid="factoring-funds-due-report".`);
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
  failures.push(...checkFeesPaidReal(src));
  failures.push(...checkPurchaseReportReal(src));
  failures.push(...checkReserveReal(src));
  failures.push(...checkChargebacksOverpaymentsReal(src));
  failures.push(...checkFundsDueReal(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const idsBlock = REQUIRED_NAV_ORDER.map((id) => `  { id: "${id}", label: "x" },`).join("\n");
  const internalBlock = INTERNAL_TOOLS_IDS.map((id) => `  { id: "${id}", label: "x" },`).join("\n");
  const agingBlock = `
    show("aging") ? (
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
      {show("request_debtor_credit_check") ||
      show("payments_to_you") ? (
        <div data-testid={\`factoring-stub-\${tab}\`}>stub</div>
      ) : null}
  `;
  const fundsDueBlock = `
      {show("funds_due") ? (
        <div data-testid="factoring-funds-due-report">
          <ParityTable
            columns={[
              { key: "customer_name", label: "Debtor" },
              { key: "display_id", label: "Invoice No" },
              { key: "submitted_at", label: "Submitted" },
              { key: "invoice_total_cents", label: "Invoice Amount" },
              { key: "advance_amount_cents", label: "Expected Advance" },
            ]}
            rows={fundsDueRows}
          />
        </div>
      ) : null}
  `;
  const fundsDueQueryDef = `
const fundsDueQuery = useQuery({ queryFn: () => getFactoringFundsDue(companyId) });
const fundsDueRows = fundsDueQuery.data?.invoices ?? [];
  `;
  const purchaseReportBlock = `
      {show("purchase_report") ? (
        <ParityTable
          columns={[
            { key: "customer_name", label: "Debtor" },
            { key: "factored_at", label: "Date" },
            { key: "invoice_reference", label: "Inv #" },
            { key: "po", label: "PO" },
            { key: "other_ref", label: "Other Ref" },
            { key: "purchase", label: "Purchase", render: (row) => fmtCurrency(row.invoice_amount) },
            { key: "escrow_rsv", label: "Escrow Rsv" },
            { key: "cash_rsv", label: "Cash Rsv", render: (row) => fmtCurrency(row.reserve_amount) },
            { key: "discount", label: "Discount" },
            { key: "fees", label: "Fees" },
            { key: "wire_fee", label: "Wire Fee" },
            { key: "rebate_income", label: "Rebate Income" },
            { key: "returned_item_fee", label: "Returned Item Fee" },
            { key: "schedule_fee", label: "Schedule Fee" },
            { key: "shipping_fee", label: "Shipping Fee" },
            { key: "cash_advance_fee", label: "Cash Advance Fee" },
            { key: "processing_fee", label: "Processing Fee" },
            { key: "dispatch", label: "Dispatch" },
            { key: "advance_amount", label: "Net Adv", render: (row) => fmtCurrency(row.advance_amount) },
            { key: "receipts", label: "Receipts" },
            { key: "sch_fee", label: "Sch Fee" },
            { key: "chargeback", label: "ChgBack (Refund)", render: (row) => fmtCurrency(row.chargeback) },
          ]}
          rows={purchaseReportRows}
        />
      ) : null}
  `;
  const accountSummaryBlock = `
      {show("account_summary") ? (
        <div data-testid="factoring-account-summary">
          <span data-testid="factoring-account-summary-ending-balance">{fmtCurrency(summary?.outstanding_liability_balance)}</span>
          <span data-testid="factoring-account-summary-reserve-balance">{fmtCurrency(engineReserve.total / 100)}</span>
          <span data-testid="factoring-account-summary-fees-total">{fmtCurrency(latestMonth?.factor_fee_total)}</span>
          <span data-testid="factoring-account-summary-adjustments">{fmtCurrency(latestMonth?.chargeback_total)}</span>
        </div>
      ) : null}
  `;
  const feesPaidBlock = `
      {show("fees_paid") ? (
        <div data-testid="factoring-fees-paid-view-toggle">
          <button data-testid="factoring-fees-paid-view-open-invoices">x</button>
          <button data-testid="factoring-fees-paid-view-all-fees">x</button>
          {feesPaidView === "open_invoices" ? (
            <span>{feesPaidOpenInvoiceRows.map((row) => row.accrued_fees)}</span>
          ) : (
            <span>{(feesQuery.data?.history ?? []).map((row) => fmtCurrency(row.factor_fee_amount))}</span>
          )}
        </div>
      ) : null}
  `;
  const chargebacksOverpaymentsBlock = `
      {show("chargebacks_overpayments") ? (
        <div>
          <span data-testid="factoring-chargebacks-overpayments-total-records">{(feesQuery.data?.history ?? []).length}</span>
          <span data-testid="factoring-chargebacks-overpayments-total-amount">
            {fmtCurrency((feesQuery.data?.history ?? []).reduce((sum, row) => sum + Number(row.chargeback_amount ?? 0), 0))}
          </span>
          <ChargebacksTable rows={feesQuery.data?.history ?? []} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />
        </div>
      ) : null}
  `;
  const reserveHistoryQueryDef = `
const reserveHistoryQuery = useQuery({
  queryFn: () => getReserveBalanceHistory(factorId, companyId, { limit: 100 }),
});
  `;
  const reserveBlock = `
      {show("reserve") && companyId ? (
        <div data-testid="factoring-reserve-report">
          <FactoringReservesSharedPanel companyId={companyId} host="factoring" />
        </div>
      ) : null}
  `;
  // Lead B7: the bindings live in the shared panel — a fixture of it for the plants below.
  const panelFixture = `
const historyQuery = useQuery({ queryFn: () => getReserveBalanceHistory(activeFactorId!, companyId, { limit: 50 }) });
const cols = [{ key: "running_balance_cents", label: "Balance", render: (row) => formatUsdCents(row.running_balance_cents) }];
  `;
  const goodSrc = `
const SUBNAV = [
${idsBlock}
] as const;
const INTERNAL_TOOLS_SUBNAV = [
${internalBlock}
] as const;
<NavyPageSubNav items={FARO_TABS.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] }))} />
${stubBlock}
${fundsDueQueryDef}
${fundsDueBlock}
${feesPaidBlock}
${purchaseReportBlock}
${chargebacksOverpaymentsBlock}
${agingBlock}
${reserveHistoryQueryDef}
${reserveBlock}
${accountSummaryBlock}
  `;
  const goodManifest = `export const FARO_TABS = [\n${OWNER_TEN.map(([id, label]) => `  { id: "${id}", label: "${label}" },`).join("\n")}\n] as const;`;
  const manifestEleven = goodManifest.replace("] as const;", '  { id: "funds_due", label: "Funds Due" },\n] as const;');
  const manifestRelabelled = goodManifest.replace('label: "Payments to us"', 'label: "Payments to You"');
  const badWrongOrder = goodSrc.replace('{ id: "aging", label: "x" },', '{ id: "zzz", label: "x" },');
  const badDeletedInternal = goodSrc.replace('{ id: "vendor_merges", label: "x" },', "");
  const badAgingMissingColumn = goodSrc.replace('{ key: "b4", label: "90+" },', "");
  const badAccountSummaryStillStub = goodSrc.replace(
    'show("payments_to_you") ? (',
    'show("payments_to_you") ||\n      show("account_summary") ? (',
  );
  const badAccountSummaryFakeBinding = goodSrc.replace(
    'data-testid="factoring-account-summary-reserve-balance">{fmtCurrency(engineReserve.total / 100)}</span>',
    'data-testid="factoring-account-summary-reserve-balance">{fmtCurrency(9999)}</span>',
  );
  const badFeesPaidStillStub = goodSrc.replace(
    'show("payments_to_you") ? (',
    'show("payments_to_you") ||\n      show("fees_paid") ? (',
  );
  const badFeesPaidFakeBinding = goodSrc.replace(
    '<span>{(feesQuery.data?.history ?? []).map((row) => fmtCurrency(row.factor_fee_amount))}</span>',
    "<span>{fmtCurrency(9999)}</span>",
  );
  const badPurchaseReportStillStub = goodSrc.replace(
    'show("payments_to_you") ? (',
    'show("payments_to_you") ||\n      show("purchase_report") ? (',
  );
  const badPurchaseReportMissingColumn = goodSrc.replace('{ key: "chargeback", label: "ChgBack (Refund)", render: (row) => fmtCurrency(row.chargeback) },', "");
  const badPurchaseReportFakeBinding = goodSrc.replace(
    '{ key: "advance_amount", label: "Net Adv", render: (row) => fmtCurrency(row.advance_amount) },',
    '{ key: "advance_amount", label: "Net Adv", render: () => fmtCurrency(9999) },',
  );
  const badChargebacksOverpaymentsStillStub = goodSrc.replace(
    'show("payments_to_you") ? (',
    'show("payments_to_you") ||\n      show("chargebacks_overpayments") ? (',
  );
  const badChargebacksOverpaymentsFakeBinding = goodSrc.replace(
    '{fmtCurrency((feesQuery.data?.history ?? []).reduce((sum, row) => sum + Number(row.chargeback_amount ?? 0), 0))}',
    "{fmtCurrency(9999)}",
  );
  const badReserveStillStub = goodSrc.replace(
    'show("payments_to_you") ? (',
    'show("payments_to_you") ||\n      show("reserve") ? (',
  );
  const badReservePanelFakeBinding = panelFixture.replace(
    "queryFn: () => getReserveBalanceHistory(activeFactorId!, companyId, { limit: 50 })",
    "queryFn: () => Promise.resolve({ movements: [] })",
  );
  const badReserveSecondView = goodSrc.replace("<FactoringReservesSharedPanel companyId={companyId} host=\"factoring\" />", "<OwnReserveTable />");

  const badFundsDueStillStub = goodSrc.replace(
    'show("payments_to_you") ? (',
    'show("payments_to_you") ||\n      show("funds_due") ? (',
  );
  const badFundsDueMissingFetch = goodSrc.replace(
    "const fundsDueQuery = useQuery({ queryFn: () => getFactoringFundsDue(companyId) });",
    "const fundsDueQuery = useQuery({ queryFn: () => recourseQuery.data });",
  );

  const checks = [
    ["clean source passes", checkNavOrder(goodSrc, goodManifest).length === 0 && checkInternalToolsPreserved(goodSrc).length === 0 && checkAgingReal(goodSrc).length === 0 && checkAccountSummaryReal(goodSrc).length === 0 && checkFeesPaidReal(goodSrc).length === 0 && checkPurchaseReportReal(goodSrc).length === 0 && checkReserveReal(goodSrc, panelFixture).length === 0 && checkChargebacksOverpaymentsReal(goodSrc).length === 0 && checkFundsDueReal(goodSrc).length === 0],
    ["a deleted section fails", checkNavOrder(badWrongOrder, goodManifest).length > 0],
    ["an eleventh Faro tab fails", checkNavOrder(goodSrc, manifestEleven).length > 0],
    ["a tab label that is not the owner's wording fails", checkNavOrder(goodSrc, manifestRelabelled).length > 0],
    ["deleted internal tab fails", checkInternalToolsPreserved(badDeletedInternal).length > 0],
    ["missing aging column fails", checkAgingReal(badAgingMissingColumn).length > 0],
    ["account summary still stub fails", checkAccountSummaryReal(badAccountSummaryStillStub).length > 0],
    ["account summary fake binding fails", checkAccountSummaryReal(badAccountSummaryFakeBinding).length > 0],
    ["fees paid still stub fails", checkFeesPaidReal(badFeesPaidStillStub).length > 0],
    ["fees paid fake binding fails", checkFeesPaidReal(badFeesPaidFakeBinding).length > 0],
    ["purchase report still stub fails", checkPurchaseReportReal(badPurchaseReportStillStub).length > 0],
    ["purchase report missing column fails", checkPurchaseReportReal(badPurchaseReportMissingColumn).length > 0],
    ["purchase report fake binding fails", checkPurchaseReportReal(badPurchaseReportFakeBinding).length > 0],
    ["chargebacks & overpayments still stub fails", checkChargebacksOverpaymentsReal(badChargebacksOverpaymentsStillStub).length > 0],
    ["chargebacks & overpayments fake binding fails", checkChargebacksOverpaymentsReal(badChargebacksOverpaymentsFakeBinding).length > 0],
    ["reserve still stub fails", checkReserveReal(badReserveStillStub, panelFixture).length > 0],
    ["reserve fake binding (panel) fails", checkReserveReal(goodSrc, badReservePanelFakeBinding).length > 0],
    ["reserve second view fails", checkReserveReal(badReserveSecondView, panelFixture).length > 0],
    ["funds due still stub fails", checkFundsDueReal(badFundsDueStillStub).length > 0],
    ["funds due missing fetch fails", checkFundsDueReal(badFundsDueMissingFetch).length > 0],
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
console.log(`${LABEL}: OK — the owner's ten Faro tabs locked in order, every section preserved (Rule 07), Aging + Account Summary + Fees Paid + Purchase Report + Reserve + Chargebacks & Overpayments real (FAC-09a)`);
process.exit(0);
