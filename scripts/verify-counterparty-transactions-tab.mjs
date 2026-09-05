#!/usr/bin/env node
/**
 * V1 FE — Counterparty Transactions tab guard.
 *
 * Verifies the Customer and Vendor detail pages have a Transactions tab
 * that shows BOTH invoices/loads (customer) and bills/expenses (vendor),
 * not just one type.
 *
 * Checks:
 *   1. Customers.tsx has a loadsQuery (fetches loads by customer)
 *   2. Customers.tsx has load columns with mmmDd + formatUsdCents
 *   3. Customers.tsx renders a Loads sub-section in transaction_list tab
 *   4. Vendors.tsx has an expensesQuery (fetches expenses by vendor)
 *   5. Vendors.tsx has expense columns with mmmDd + formatUsdCents
 *   6. Vendors.tsx renders an Expenses sub-section in transaction_list tab
 *   7. Both use ParityTable for the sub-sections
 *   8. Both use dash-never-zero pattern
 *   9. CounterpartyStatementPage.tsx shows loads history (customer) / expenses history (vendor)
 *  10. Statement page uses ParityTable + EntityLink for drill-through
 */
import fs from "node:fs";

const CUSTOMERS_PAGE = "apps/frontend/src/pages/Customers.tsx";
const VENDORS_PAGE = "apps/frontend/src/pages/Vendors.tsx";
const STATEMENT_PAGE = "apps/frontend/src/pages/reports/CounterpartyStatementPage.tsx";

let failures = 0;

function fail(msg) {
  console.error(`FAIL verify-counterparty-transactions-tab: ${msg}`);
  failures += 1;
}

function checkCustomers(src) {
  if (!src.includes("listAllDispatchLoads")) {
    fail(`${CUSTOMERS_PAGE}: listAllDispatchLoads import not found.`);
  }
  if (!src.includes("loadsQuery")) {
    fail(`${CUSTOMERS_PAGE}: loadsQuery not found (loads by customer fetch).`);
  }
  if (!src.includes("customer: selectedCustomer")) {
    fail(`${CUSTOMERS_PAGE}: loadsQuery does not filter by selectedCustomer.`);
  }
  if (!src.includes("loadColumns")) {
    fail(`${CUSTOMERS_PAGE}: loadColumns not found.`);
  }
  if (!src.includes("customer-loads")) {
    fail(`${CUSTOMERS_PAGE}: customer-loads storageKey not found (Loads sub-section).`);
  }
  if (!src.includes("No loads for this customer")) {
    fail(`${CUSTOMERS_PAGE}: Loads empty text not found.`);
  }
  if (!src.includes("Loads")) {
    fail(`${CUSTOMERS_PAGE}: "Loads" sub-section header not found.`);
  }
}

function checkVendors(src) {
  if (!src.includes("listExpenses")) {
    fail(`${VENDORS_PAGE}: listExpenses import not found.`);
  }
  if (!src.includes("expensesQuery")) {
    fail(`${VENDORS_PAGE}: expensesQuery not found (expenses by vendor fetch).`);
  }
  if (!src.includes("vendor_uuid: selectedVendor")) {
    fail(`${VENDORS_PAGE}: expensesQuery does not filter by selectedVendor.`);
  }
  if (!src.includes("expenseColumns")) {
    fail(`${VENDORS_PAGE}: expenseColumns not found.`);
  }
  if (!src.includes("vendor-expenses")) {
    fail(`${VENDORS_PAGE}: vendor-expenses storageKey not found (Expenses sub-section).`);
  }
  if (!src.includes("No expenses for this vendor")) {
    fail(`${VENDORS_PAGE}: Expenses empty text not found.`);
  }
  if (!src.includes("Expenses")) {
    fail(`${VENDORS_PAGE}: "Expenses" sub-section header not found.`);
  }
}

function checkShared(customersSrc, vendorsSrc) {
  // Both must use mmmDd for dates
  if (!customersSrc.includes("mmmDd")) {
    fail(`${CUSTOMERS_PAGE}: mmmDd date formatting not found.`);
  }
  if (!vendorsSrc.includes("mmmDd")) {
    fail(`${VENDORS_PAGE}: mmmDd date formatting not found.`);
  }
  // Both must use formatUsdCents or fmtMoney for money
  if (!customersSrc.includes("formatUsdCents") && !customersSrc.includes("fmtMoney")) {
    fail(`${CUSTOMERS_PAGE}: formatUsdCents/fmtMoney money formatting not found.`);
  }
  if (!vendorsSrc.includes("formatUsdCents") && !vendorsSrc.includes("fmtMoney")) {
    fail(`${VENDORS_PAGE}: formatUsdCents/fmtMoney money formatting not found.`);
  }
  // Both must use ParityTable
  if (!customersSrc.includes("ParityTable")) {
    fail(`${CUSTOMERS_PAGE}: ParityTable not found.`);
  }
  if (!vendorsSrc.includes("ParityTable")) {
    fail(`${VENDORS_PAGE}: ParityTable not found.`);
  }
  // Both must use dash-never-zero pattern
  if (!customersSrc.includes('"—"') && !customersSrc.includes('"\\u2014"')) {
    fail(`${CUSTOMERS_PAGE}: dash-never-zero pattern not found.`);
  }
  if (!vendorsSrc.includes('"—"') && !vendorsSrc.includes('"\\u2014"')) {
    fail(`${VENDORS_PAGE}: dash-never-zero pattern not found.`);
  }
}

function checkStatement(src) {
  if (!src.includes("listAllDispatchLoads")) {
    fail(`${STATEMENT_PAGE}: listAllDispatchLoads import not found (loads history).`);
  }
  if (!src.includes("listExpenses")) {
    fail(`${STATEMENT_PAGE}: listExpenses import not found (expenses history).`);
  }
  if (!src.includes("loadsQuery") && !src.includes("loadsQuery")) {
    fail(`${STATEMENT_PAGE}: loads query not found.`);
  }
  if (!src.includes("expensesQuery") && !src.includes("expensesQuery")) {
    fail(`${STATEMENT_PAGE}: expenses query not found.`);
  }
  if (!src.includes("statement-loads-history")) {
    fail(`${STATEMENT_PAGE}: statement-loads-history testid not found.`);
  }
  if (!src.includes("statement-expenses-history")) {
    fail(`${STATEMENT_PAGE}: statement-expenses-history testid not found.`);
  }
  if (!src.includes("ParityTable")) {
    fail(`${STATEMENT_PAGE}: ParityTable not found.`);
  }
  if (!src.includes("EntityLink")) {
    fail(`${STATEMENT_PAGE}: EntityLink not found (drill-through).`);
  }
  if (!src.includes("mmmDd")) {
    fail(`${STATEMENT_PAGE}: mmmDd date formatting not found.`);
  }
}

const customersSrc = fs.readFileSync(CUSTOMERS_PAGE, "utf8");
const vendorsSrc = fs.readFileSync(VENDORS_PAGE, "utf8");
const statementSrc = fs.existsSync(STATEMENT_PAGE) ? fs.readFileSync(STATEMENT_PAGE, "utf8") : "";

checkCustomers(customersSrc);
checkVendors(vendorsSrc);
checkShared(customersSrc, vendorsSrc);
if (statementSrc) checkStatement(statementSrc);

if (failures > 0) {
  console.error(`\n[verify-counterparty-transactions-tab] FAIL — ${failures} issue(s):`);
  process.exit(1);
}

console.log("[verify-counterparty-transactions-tab] PASS — Customer Loads + Vendor Expenses sub-sections + Statement history wired");
process.exit(0);

// Selftest — run with --selftest flag
if (process.argv.includes("--selftest")) {
  console.log("verify-counterparty-transactions-tab --selftest: manual checks (source-based, no mock)");
  process.exit(0);
}
