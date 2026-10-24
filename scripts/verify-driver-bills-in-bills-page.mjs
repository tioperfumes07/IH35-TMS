#!/usr/bin/env node
/** BILLS-DRIVER — one union read model for vendor + driver bills. */
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  route: "apps/backend/src/accounting/bills.routes.ts",
  api: "apps/frontend/src/api/accounting.ts",
  page: "apps/frontend/src/pages/accounting/BillsPage.tsx",
};
const read = (name) => fs.readFileSync(path.join(ROOT, FILES[name]), "utf8");

function failures(src) {
  const out = [];
  const require = (name, re, message) => { if (!re.test(src[name])) out.push(message); };
  require("route", /\/api\/v1\/accounting\/bills\/register/, "missing one accounting bills register route");
  require("route", /FROM driver_finance\.driver_bills db/, "register does not read canonical driver_finance.driver_bills");
  require("route", /listBills\(/, "register does not read canonical accounting.bills service");
  require("route", /bill_type: z\.enum\(\["all", "vendor_bill", "driver_bill"\]\)/, "backend type filter missing");
  require("route", /vendor_bill: vendorTotals/, "vendor totals missing");
  require("route", /await aggregateBillsForRegister\(String\(user\.uuid\), query\.data\.operating_company_id, \{ \.\.\.listOptions, vendorId: query\.data\.vendor_id \}\)/, "vendor aggregate must use company and complete list filters");
  require("route", /driver_bill: driverResult\.totals/, "driver totals missing");
  require("route", /client\.query\(DRIVER_BILL_REGISTER_TOTAL_SQL, values\)/, "driver aggregate must use the same bound filters");
  require("route", /DRIVER_BILL_REGISTER_SQL\.replace\("LIMIT \$3 OFFSET \$4", ""\)/, "driver totals must remove pagination from the exact register cohort");
  require("route", /count: Number\(total\.rows\[0\]\?\.count \?\? 0\), amount_cents: Number\(total\.rows\[0\]\?\.amount_cents \?\? 0\)/, "driver totals must come from full SQL aggregate, not page length");
  require("route", /db\.status <> 'void' AND db\.voided_at IS NULL/, "driver rows do not exclude both void signals");
  require("api", /listBillRegister\(/, "frontend API does not call the union register");
  require("page", /listBillRegister\(/, "Bills page still lacks the one-route register call");
  require("page", /data-testid="bills-register-tabs"/, "Bills page register tabs missing");
  require("page", /data-testid=\{[^}]*"bills-tab-vendor"/, "Bills page vendor tab missing");
  require("page", /data-testid=\{[^}]*"bills-tab-driver"/, "Bills page driver tab missing");
  require("page", /totals\.vendor_bill\.count/, "Bills page vendor per-type count missing");
  require("page", /totals\.driver_bill\.count/, "Bills page driver per-type count missing");
  require("page", /label: "Type"[\s\S]*?"Driver bill"/, "Driver bill Type column missing");
  require("page", /label: "Type"[\s\S]*?"Vendor bill"/, "Vendor bill Type column missing");
  require("page", /kind="settlement"/, "driver bill settlement drill-through missing");
  return out;
}

const real = Object.fromEntries(Object.keys(FILES).map((name) => [name, read(name)]));
if (process.argv.includes("--selftest")) {
  const base = failures(real);
  if (base.length) {
    console.error("verify-driver-bills-in-bills-page --selftest FAIL — real files red:\n" + base.join("\n"));
    process.exit(1);
  }
  const mutations = [
    ["route", 'vendor_bill: vendorTotals', 'vendor_bill: { count: vendorRows.length }'],
    ["route", 'driver_bill: driverResult.totals', 'driver_bill: { count: driverRows.length }'],
    ["route", 'client.query(DRIVER_BILL_REGISTER_TOTAL_SQL, values)', 'client.query(DRIVER_BILL_REGISTER_TOTAL_SQL, [])'],
    ["route", 'DRIVER_BILL_REGISTER_SQL.replace("LIMIT $3 OFFSET $4", "")', 'DRIVER_BILL_REGISTER_SQL'],
    ["route", '...listOptions, vendorId: query.data.vendor_id', 'vendorId: undefined'],
    ["route", "/api/v1/accounting/bills/register", "/api/v1/accounting/bills/vendor-only"],
    ["route", "FROM driver_finance.driver_bills db", "FROM accounting.bills db"],
    ["page", 'data-testid="bills-register-tabs"', 'data-testid="removed-register-tabs"'],
    ["page", 'tab.id === "vendor_bill" ? "bills-tab-vendor" : "bills-tab-driver"', 'tab.id === "vendor_bill" ? "removed-tab-vendor" : "removed-tab-driver"'],
  ];
  for (const [name, before, after] of mutations) {
    const mutant = { ...real, [name]: real[name].replaceAll(before, after) };
    if (failures(mutant).length === 0) {
      console.error(`verify-driver-bills-in-bills-page --selftest FAIL — mutation escaped: ${before}`);
      process.exit(1);
    }
  }
  console.log(`verify-driver-bills-in-bills-page --selftest PASS — ${mutations.length}/${mutations.length} planted contract breaks caught`);
  process.exit(0);
}

const found = failures(real);
if (found.length) {
  console.error("verify-driver-bills-in-bills-page FAIL:\n" + found.map((x) => `  - ${x}`).join("\n"));
  process.exit(1);
}
console.log("verify-driver-bills-in-bills-page PASS — one union route, Type filter/columns, per-type totals, settlement drill, dual void predicate");
