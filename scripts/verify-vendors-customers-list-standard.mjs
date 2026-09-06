#!/usr/bin/env node
// VC-LIST-01 guard (owner ROUND 11, 2026-09-06). Measured live 05:29Z on /vendors and /customers:
// every OPEN BALANCE $0.00, a single "Sort by name" select (no column asc/desc), page size with no
// All, filters that don't visibly filter, STATUS showing quality chips not active/inactive. This guard
// pins the fix so it can't regress:
//   1. Both lists render a ParityTable (sortable headers, page size incl. All, column chooser, export)
//      — never a raw <table>.
//   2. The owner-spec columns exist and are REAL:
//        Vendors:  Code · Type · Category · Open balance · Spend (MTD) · Spend (YTD) · Last activity · Status
//        Customers: Type · Status · Open A/R · Overdue · Revenue (MTD) · Revenue (YTD) · Last load · Factored? · Credit limit
//   3. Balances come from the REAL source: the vendor-rollups endpoint aggregates accounting.bills +
//      accounting.expenses (Open balance = unpaid non-void bills; Spend = bills + expenses), and the
//      list reads spend_mtd_cents / spend_ytd_cents / open_balance_cents; customers read invoice-based
//      A/R (ar_open_cents, excl void + pro forma) and Revenue (MTD/YTD).
//   4. VC-LIST-02 (owner "ALL PAGE SIZE", 2026-09-06): both lists pass allowAllPageSize so the
//      ParityTable page-size control offers "All" (renders every row; sort survives it).
//
// --selftest mutates each load-bearing fact and requires each mutation to FAIL; clean sources pass.
import fs from "node:fs";

const VLIST = "apps/frontend/src/pages/vendors/VendorsListView.tsx";
const CLIST = "apps/frontend/src/pages/customers/CustomersListView.tsx";
const ROLLUP = "apps/backend/src/mdata/vendor-rollups.routes.ts";

function analyze(vlist, clist, rollup) {
  const errors = [];

  // --- Vendors list ---
  if (!/<ParityTable\b/.test(vlist)) errors.push("VendorsListView does not render <ParityTable>");
  if (/<table\b/.test(vlist)) errors.push("VendorsListView contains a raw <table> — forbidden (go26); use ParityTable");
  if (!/exportFilename=/.test(vlist)) errors.push("VendorsListView ParityTable has no exportFilename (export requirement)");
  if (!/filterBar=/.test(vlist)) errors.push("VendorsListView has no filterBar (filters requirement)");
  for (const [key, human] of [
    ['key: "vendor_code"', "Code"],
    ['key: "vendor_category"', "Category"],
    ['key: "spend_mtd"', "Spend (MTD)"],
    ['key: "spend_ytd"', "Spend (YTD)"],
    ['key: "last_activity"', "Last activity"],
    ['key: "open_balance"', "Open balance"],
  ]) {
    if (!vlist.includes(key)) errors.push(`VendorsListView missing required column ${human} (${key})`);
  }
  // Status must be active/inactive, not a quality chip.
  if (!/deactivated_at\b[\s\S]*?Inactive|Inactive[\s\S]*?Active/.test(vlist))
    errors.push("VendorsListView Status column must render Active/Inactive from deactivated_at");
  // Spend must be REAL (read from the rollup's spend_*_cents), not a placeholder.
  if (!/spend_mtd_cents/.test(vlist) || !/spend_ytd_cents/.test(vlist))
    errors.push("VendorsListView does not read spend_mtd_cents / spend_ytd_cents from the rollup (Spend must be real)");
  // At least the name column sorts (sortable headers, not a single sort-by-name select).
  if (!/sortable:\s*true/.test(vlist)) errors.push("VendorsListView has no sortable column headers");
  // VC-LIST-02 (owner "ALL PAGE SIZE", 2026-09-06): the page-size control must offer "All".
  if (!/allowAllPageSize\b/.test(vlist))
    errors.push("VendorsListView ParityTable lacks allowAllPageSize (owner 'ALL PAGE SIZE')");

  // --- Customers list ---
  if (!/<ParityTable\b/.test(clist)) errors.push("CustomersListView does not render <ParityTable>");
  if (/<table\b/.test(clist)) errors.push("CustomersListView contains a raw <table> — forbidden (go26); use ParityTable");
  for (const [key, human] of [
    ['key: "customer_type"', "Type"],
    ['key: "status"', "Status"],
    ['key: "ar_open_cents"', "Open A/R"],
    ['key: "overdue_label"', "Overdue"],
    ['key: "revenue_mtd_cents"', "Revenue (MTD)"],
    ['key: "booked_ytd_cents"', "Revenue (YTD)"],
    ['key: "last_load_iso"', "Last load"],
    ['key: "factored_label"', "Factored?"],
    ['key: "credit_limit"', "Credit limit"],
  ]) {
    if (!clist.includes(key)) errors.push(`CustomersListView missing required column ${human} (${key})`);
  }
  // A/R + Revenue must be real values off the rollup, not placeholders.
  if (!/ar_open_cents/.test(clist)) errors.push("CustomersListView does not read ar_open_cents (invoice-based A/R)");
  if (!/revenue_mtd_cents/.test(clist)) errors.push("CustomersListView does not read revenue_mtd_cents (Revenue MTD)");
  if (!/sortable:\s*true/.test(clist)) errors.push("CustomersListView has no sortable column headers");
  // VC-LIST-02 — customers page-size control must offer "All" too.
  if (!/allowAllPageSize\b/.test(clist))
    errors.push("CustomersListView ParityTable lacks allowAllPageSize (owner 'ALL PAGE SIZE')");

  // --- Backend rollup: REAL balance source (bills + expenses) ---
  if (!/accounting\.bills/.test(rollup)) errors.push("vendor-rollups does not aggregate accounting.bills (Open balance / Spend must include bills)");
  if (!/accounting\.expenses/.test(rollup)) errors.push("vendor-rollups does not aggregate accounting.expenses");
  for (const field of ["open_balance_cents", "spend_ytd_cents", "spend_mtd_cents", "last_activity_date"]) {
    if (!rollup.includes(field)) errors.push(`vendor-rollups endpoint does not return ${field}`);
  }
  // Open balance = unpaid, non-void bills.
  if (!/voided_at IS NULL/.test(rollup)) errors.push("vendor-rollups open balance does not exclude voided bills (voided_at IS NULL)");
  if (!/status <> 'paid'/.test(rollup)) errors.push("vendor-rollups open balance does not exclude paid bills (status <> 'paid')");

  return errors;
}

const vlist = fs.readFileSync(VLIST, "utf8");
const clist = fs.readFileSync(CLIST, "utf8");
const rollup = fs.readFileSync(ROLLUP, "utf8");

if (process.argv.includes("--selftest")) {
  const clean = analyze(vlist, clist, rollup);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["vendors ParityTable -> raw table", [vlist.replace("<ParityTable", "<table data-x").replace(/\bParityTable\b/g, "table"), clist, rollup]],
    ["vendors drop Spend MTD column", [vlist.replace(/key: "spend_mtd"/g, 'key: "gone_mtd"'), clist, rollup]],
    ["vendors drop Category column", [vlist.replace(/key: "vendor_category"/g, 'key: "gone_cat"'), clist, rollup]],
    ["vendors stop reading real spend", [vlist.replace(/spend_ytd_cents/g, "zero_cents"), clist, rollup]],
    ["customers drop Open A/R column", [vlist, clist.replace(/key: "ar_open_cents"/g, 'key: "gone_ar"'), rollup]],
    ["customers drop Factored column", [vlist, clist.replace(/key: "factored_label"/g, 'key: "gone_fac"'), rollup]],
    ["customers drop Credit limit", [vlist, clist.replace(/key: "credit_limit"/g, 'key: "gone_cl"'), rollup]],
    ["rollup drops bills aggregate", [vlist, clist, rollup.replace(/accounting\.bills/g, "accounting.nope")]],
    ["rollup drops open_balance_cents", [vlist, clist, rollup.replace(/open_balance_cents/g, "gone_cents")]],
    ["rollup counts voided bills", [vlist, clist, rollup.replace(/voided_at IS NULL/g, "TRUE")]],
    // VC-LIST-02 — dropping the "All" page-size option on either list must FAIL.
    ["vendors drop All page size", [vlist.replace(/allowAllPageSize/g, "noAllPageSize"), clist, rollup]],
    ["customers drop All page size", [vlist, clist.replace(/allowAllPageSize/g, "noAllPageSize"), rollup]],
  ];
  let caught = 0;
  for (const [label, [v, c, r]] of mutations) {
    if (analyze(v, c, r).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-vendors-customers-list-standard --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(vlist, clist, rollup);
if (failures.length) {
  console.error("FAIL verify-vendors-customers-list-standard");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-vendors-customers-list-standard");
