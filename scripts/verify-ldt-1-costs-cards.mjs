#!/usr/bin/env node
// LDT-1C guard (register CURSOR-LOAD-DETAIL-TABS-BUILD-2026-09-05.md § LDT-1; owner order 2026-09-05
// 23:45Z + LDT-1 split bus bde36db4 00:24Z; LIVE render
// docs/design/reference/LOAD-DETAIL-TABS-RENDERS-LIVE-13526-2026-09-05.html).
//
// SCOPE (LDT-1 split): Cursor owns LDT-1C — the Costs CARDS inside LoadDetailDrawer only
// (components/dispatch/**). Receipt upload on the standalone expense/bill creators
// (VendorBillForm, RecordExpenseForm, CreateMultipleBillsPage) is LDT-1R, owned by the lead
// via components/documents/ReceiptAttach.tsx — this guard deliberately does NOT audit those files.
//
// Asserts, on tip source (no self-certification of runtime):
//   Costs tab (LoadDetailCostsTab.tsx) is a stacked register of entry CARDS:
//     - the NUMBER is an auto LABEL (data-testid="load-cost-number"), never an editable input
//       (the old data-testid="load-cost-field-number" must be gone);
//     - an Expense·paid now / Bill·owed toggle on each card;
//     - a Receipt control on every card;
//     - a margin/totals footer computed as revenue − costs − driver pay;
//     - the totals footer is FIXED (sticky) so it stays put when the cards scroll (owner ruling);
//     - a "What the bank will do" section and a drill-down pop-up.
//   The LIVE DEFECT is fixed: "Paid with" is restricted to bank/credit-card accounts via
//     isPaidWithAccount — the broad /asset|bank|credit ?card/ filter (which surfaced 1240 Freight
//     Claims Receivable and 1296 Faro Factoring) must NOT be present.
import fs from "node:fs";

const COSTS = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
// LDT-1 (owner order 2026-09-05 23:45Z) also put the Book Load wizard MilesStrip live geocode
// preview under this step: the wizard must quote the linehaul (pickup→delivery) AND the Empty leg
// (yard→pickup) via the route-reference proxy and show them read-only. Cursor owns BookLoadModalV4.
const WIZARD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const MILES_STRIP = "apps/frontend/src/pages/dispatch/components/book-load-v4/MilesStrip.tsx";

function auditCosts(src) {
  const errors = [];
  // Card, not spreadsheet.
  if (!src.includes('data-testid="load-cost-number"')) errors.push("card NUMBER label (load-cost-number) is missing");
  if (src.includes('data-testid="load-cost-field-number"')) errors.push("NUMBER regressed to an editable input (load-cost-field-number) — LDT-1: you never type the number");
  if (!src.includes('data-testid="load-cost-toggle-expense"') || !src.includes('data-testid="load-cost-toggle-bill"')) errors.push("Expense/Bill toggle is missing on the entry card");
  if (!src.includes('data-testid="load-cost-receipt"')) errors.push("Receipt control (load-cost-receipt) is missing on the entry card");
  if (!src.includes('data-testid="load-cost-caption"')) errors.push("posting-hint caption (load-cost-caption) is missing");
  if (!src.includes('data-testid="load-costs-margin"')) errors.push("margin/totals footer (load-costs-margin) is missing");
  if (!src.includes('data-testid="load-costs-bank-section"')) errors.push('"What the bank will do" section (load-costs-bank-section) is missing');
  if (!src.includes('data-testid="load-costs-popup"')) errors.push("drill-down pop-up (load-costs-popup) is missing");
  // Totals footer is FIXED (sticky) — owner: rearrange columns, totals stay stuck.
  if (!/data-testid="load-costs-margin"[^>]*className="[^"]*sticky/.test(src)) errors.push("totals footer (load-costs-margin) is not FIXED/sticky — owner ruling: totals stay stuck");
  // Vendor doc no. on bills.
  if (!src.includes('data-testid="load-cost-field-vendor-invoice"')) errors.push("Vendor doc no. field on bills is missing");
  // Margin formula = revenue − costs − driver pay.
  if (!src.includes("revenue - savedCosts - driverPay")) errors.push("margin is not computed as revenue − costs − driver pay");
  // Paid-with LIVE DEFECT fix.
  if (!src.includes("function isPaidWithAccount")) errors.push("isPaidWithAccount (bank/card-only Paid-with filter) is missing");
  if (!src.includes("chart.filter((row) => isPaidWithAccount(row.account_type))")) errors.push("Paid-with is not sourced through isPaidWithAccount");
  if (!/=== "bank"/.test(src) || !/=== "creditcard"/.test(src)) errors.push("isPaidWithAccount does not restrict to bank/credit-card roles");
  if (src.includes("/asset|bank|credit ?card/")) errors.push("LIVE DEFECT: the broad /asset|bank|credit ?card/ Paid-with filter is back — receivables/factoring would appear");
  // Receipt attaches to the saved entity inside the drawer (LDT-1C, not a creator form).
  if (!src.includes("EntityDocumentUpload")) errors.push("saved cards do not attach a receipt via EntityDocumentUpload");
  return errors;
}

function auditWizardGeocode(wizardSrc, stripSrc) {
  const errors = [];
  // The wizard actually calls the route-reference proxy (not just imports it).
  if (!wizardSrc.includes("geocodeRouteReference(")) errors.push("BookLoadModalV4 does not call geocodeRouteReference — the MilesStrip live geocode preview is not wired");
  // The Empty leg's origin is the yard fallback constant (single source, TODO TEL-42), never a
  // second hard-coded coordinate pair.
  if (!wizardSrc.includes("YARD_FALLBACK")) errors.push("BookLoadModalV4 does not use the YARD_FALLBACK constant for the Empty-leg origin");
  if (!/TODO\(TEL-42\)/.test(wizardSrc)) errors.push("YARD_FALLBACK is missing its TODO(TEL-42) removal marker (owner ruling: single constant, removed when the yard row lands)");
  // Both reference figures reach MilesStrip.
  if (!/googleReferencePractical=\{/.test(wizardSrc)) errors.push("BookLoadModalV4 does not pass googleReferencePractical to MilesStrip");
  if (!/googleReferenceEmpty=\{/.test(wizardSrc)) errors.push("BookLoadModalV4 does not pass googleReferenceEmpty (yard→pickup) to MilesStrip");
  // MilesStrip renders the Empty-leg reference read-only (no input / onChange in the block).
  const emptyBlock = stripSrc.match(/\{googleReferenceEmpty \? \(([\s\S]*?)\) : null\}/);
  if (!emptyBlock) errors.push("MilesStrip does not render googleReferenceEmpty as a plain read-only conditional block");
  else if (/<input|onChange/.test(emptyBlock[1])) errors.push("MilesStrip Empty-leg reference must be read-only — no <input> or onChange in the block");
  return errors;
}

function run(costs, wizard, strip) {
  return [...auditCosts(costs), ...auditWizardGeocode(wizard, strip)];
}

const costs = fs.readFileSync(COSTS, "utf8");
const wizard = fs.readFileSync(WIZARD, "utf8");
const strip = fs.readFileSync(MILES_STRIP, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["costs: drop number label", [costs.replace('data-testid="load-cost-number"', 'data-testid="load-cost-nope"'), wizard, strip]],
    ["costs: number regressed to input", [costs + '\ndata-testid="load-cost-field-number"', wizard, strip]],
    ["costs: drop expense toggle", [costs.replace('data-testid="load-cost-toggle-expense"', 'data-testid="x"'), wizard, strip]],
    ["costs: drop receipt", [costs.replaceAll('data-testid="load-cost-receipt"', 'data-testid="x"'), wizard, strip]],
    ["costs: drop margin footer", [costs.replace('data-testid="load-costs-margin"', 'data-testid="x"'), wizard, strip]],
    ["costs: drop bank section", [costs.replace('data-testid="load-costs-bank-section"', 'data-testid="x"'), wizard, strip]],
    ["costs: unstick totals footer", [costs.replace(/(data-testid="load-costs-margin" className=")sticky bottom-0 z-10 /, "$1"), wizard, strip]],
    ["costs: reintroduce broad asset filter", [costs.replace("chart.filter((row) => isPaidWithAccount(row.account_type))", "chart.filter((row) => /asset|bank|credit ?card/.test(row.account_type))"), wizard, strip]],
    ["costs: drop margin formula", [costs.replace("revenue - savedCosts - driverPay", "revenue"), wizard, strip]],
    ["costs: drop receipt upload primitive", [costs.replaceAll("EntityDocumentUpload", "NopeUpload"), wizard, strip]],
    ["wizard: drop geocode call", [costs, wizard.replaceAll("geocodeRouteReference(", "nope("), strip]],
    ["wizard: drop YARD_FALLBACK", [costs, wizard.replaceAll("YARD_FALLBACK", "NOPE_YARD"), strip]],
    ["wizard: drop TEL-42 todo", [costs, wizard.replace("TODO(TEL-42)", "todo later"), strip]],
    ["wizard: drop practical ref prop", [costs, wizard.replace("googleReferencePractical={", "nopePractical={"), strip]],
    ["wizard: drop empty ref prop", [costs, wizard.replace("googleReferenceEmpty={", "nopeEmpty={"), strip]],
    ["strip: empty ref becomes editable", [costs, wizard, strip.replace(/(\{googleReferenceEmpty \? \()/, "$1<input onChange={()=>{}} />&&")]],
  ];
  let caught = 0;
  for (const [label, args] of mutations) {
    if (run(...args).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  const clean = run(costs, wizard, strip);
  if (clean.length) { console.error(`SELFTEST FAIL — good sources rejected:\n- ${clean.join("\n- ")}`); process.exit(1); }
  console.log(`PASS verify-ldt-1-costs-cards --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = run(costs, wizard, strip);
if (failures.length) {
  console.error("FAIL verify-ldt-1-costs-cards");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-ldt-1-costs-cards");
