#!/usr/bin/env node
/**
 * ROUND 432-CUR #5 — Bills page shows ONE register at a time (tabs), never two tables stacked.
 *
 * Owner: "Bills page still renders two tables… tabs or two pages."
 * Vendor bills (accounting.bills) and driver bills (driver_finance.driver_bills) keep separate
 * column sets; the UI must not paint both ParityTables on one screen.
 *
 * Usage:
 *   node scripts/verify-bills-one-register-at-a-time.mjs
 *   node scripts/verify-bills-one-register-at-a-time.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkSources(sources) {
  const problems = [];
  const { page } = sources;

  if (!/data-testid=["']bills-register-tabs["']/.test(page)) {
    problems.push("BillsPage must expose bills-register-tabs (Vendor | Driver)");
  }
  if (!/["']bills-tab-vendor["']/.test(page) || !/["']bills-tab-driver["']/.test(page)) {
    problems.push("BillsPage must expose bills-tab-vendor and bills-tab-driver");
  }
  if (!/useState<BillsRegisterTab>\(\s*["']vendor_bill["']\s*\)/.test(page)) {
    problems.push("default register tab must be vendor_bill (never 'all')");
  }
  if (!/showVendorBills\s*=\s*billType\s*===\s*["']vendor_bill["']/.test(page)) {
    problems.push("showVendorBills must gate on billType === vendor_bill");
  }
  if (!/showDriverBills\s*=\s*billType\s*===\s*["']driver_bill["']/.test(page)) {
    problems.push("showDriverBills must gate on billType === driver_bill only");
  }
  if (/data-testid=["']bills-type-filter["']/.test(page)) {
    problems.push("Type multi-select (bills-type-filter) must be gone — tabs own the register choice");
  }
  if (/billTypesToSelected|selectedToBillType/.test(page)) {
    problems.push("billTypesToSelected / selectedToBillType (Type=all dual path) must be gone");
  }
  // Both registers must be mutually exclusive in JSX — vendor wrapped in showVendorBills,
  // driver in showDriverBills; never an ungated second ParityTable.
  if (!/\{showVendorBills\s*\?/.test(page)) {
    problems.push("vendor ParityTable must render only inside {showVendorBills ? …}");
  }
  if (!/\{showDriverBills\s*\?/.test(page)) {
    problems.push("driver ParityTable must render only inside {showDriverBills ? …}");
  }

  return problems;
}

function selftest() {
  const good = {
    page: `
export type BillsRegisterTab = "vendor_bill" | "driver_bill";
const [billType, setBillType] = useState<BillsRegisterTab>("vendor_bill");
const showDriverBills = billType === "driver_bill";
const showVendorBills = billType === "vendor_bill";
<div data-testid="bills-register-tabs" role="tablist">
  <button data-testid="bills-tab-vendor" />
  <button data-testid="bills-tab-driver" />
</div>
{showVendorBills ? (<ParityTable />) : null}
{showDriverBills ? (<div data-testid="bills-driver-register"><ParityTable /></div>) : null}
`,
  };
  const bad = {
    page: `
const [billType, setBillType] = useState("all");
const showDriverBills = billType !== "vendor_bill";
<div data-testid="bills-type-filter" />
function billTypesToSelected() {}
<ParityTable /><ParityTable />
`,
  };
  const g = checkSources(good);
  const b = checkSources(bad);
  if (g.length || b.length < 3) {
    console.error(`verify-bills-one-register-at-a-time --selftest FAIL good=${g.join(";")} bad=${b.join(";")}`);
    process.exit(1);
  }
  console.log("verify-bills-one-register-at-a-time --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const page = read(PAGE);
  const problems = checkSources({ page });
  if (problems.length) {
    console.error(`verify-bills-one-register-at-a-time FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(
    "verify-bills-one-register-at-a-time OK — Bills Vendor|Driver tabs; one ParityTable at a time; Type=all dual register gone (432-CUR #5)"
  );
}

main();
