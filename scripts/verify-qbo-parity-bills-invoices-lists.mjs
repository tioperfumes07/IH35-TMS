#!/usr/bin/env node
// verify-qbo-parity-bills-invoices-lists — locks the QBO-parity additions to the Bills and Invoices
// list views so they cannot silently regress (§2: every fix/feature gets a static CI guard).
//
// Bills list (BillsPage.tsx) must keep:
//   - a "Due date" column and a "Memo" column
//   - a per-row Overdue badge (the KPI-derived billDueStatus + BillDueBadge)
//   - a server-side Vendor filter (listVendors import + vendor_id wired into listBills + "All vendors")
// Invoices list (InvoicesListPage.tsx) must keep:
//   - a "Load #" column and a "Memo" column
//   - the QBO status filter options "Not sent" (not_sent) and "With balance" (with_balance)
//   - a server-side Customer filter (exhaustive listAllCustomers roster + customer_id wired + "All customers")
//
// Self-test: node scripts/verify-qbo-parity-bills-invoices-lists.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BILLS = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const INVOICES = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";

// Pure checks over the two files' text — takes an object so --selftest can inject fixtures.
export function check({ bills, invoices }) {
  const f = [];

  // ---- Bills list ----
  if (!/label:\s*"Due date"/.test(bills)) f.push(`${BILLS}: Bills list must have a "Due date" column`);
  if (!/label:\s*"Memo"/.test(bills)) f.push(`${BILLS}: Bills list must have a "Memo" column`);
  if (!/function\s+billDueStatus/.test(bills) || !/BillDueBadge/.test(bills) || !/>Overdue</.test(bills))
    f.push(`${BILLS}: Bills list must render a per-row Overdue badge (billDueStatus + BillDueBadge + "Overdue")`);
  if (!/import\s*\{\s*listVendors\s*\}\s*from\s*["']\.\.\/\.\.\/api\/mdata["']/.test(bills))
    f.push(`${BILLS}: Bills list must import listVendors for the Vendor filter`);
  if (!/vendor_id:\s*vendorId\s*\|\|\s*undefined/.test(bills))
    f.push(`${BILLS}: Bills list must wire vendor_id (vendorId) into listBills`);
  if (!/All vendors/.test(bills)) f.push(`${BILLS}: Bills list must have an "All vendors" Vendor filter option`);

  // ---- Invoices list ----
  if (!/label:\s*"Load #"/.test(invoices)) f.push(`${INVOICES}: Invoices list must have a "Load #" column`);
  if (!/kind="load"/.test(invoices)) f.push(`${INVOICES}: Invoices list "Load #" column must link the load (kind="load")`);
  // ACCT-F5062 — CLS-LINKAGE-ONEWAY: Load # must use joined source_load_number, not null→UUID chrome.
  if (!/entityLabel\(\s*row\.source_load_number\s*,\s*row\.source_load_id\s*,\s*["']Load["']\s*\)/.test(invoices)) {
    f.push(`${INVOICES}: Load # EntityLink must entityLabel(row.source_load_number, …)`);
  }
  if (/entityLabel\(\s*null\s*,\s*row\.source_load_id\s*,\s*["']Load["']\s*\)/.test(invoices)) {
    f.push(`${INVOICES}: must not entityLabel(null, source_load_id) — UUID chrome`);
  }
  if (!/label:\s*"Memo"/.test(invoices)) f.push(`${INVOICES}: Invoices list must have a "Memo" column`);
  if (!/value:\s*"not_sent"/.test(invoices)) f.push(`${INVOICES}: Invoices list must offer the "Not sent" (not_sent) status filter`);
  if (!/value:\s*"with_balance"/.test(invoices)) f.push(`${INVOICES}: Invoices list must offer the "With balance" (with_balance) status filter`);
  if (!/import\s*\{\s*listAllCustomers\s*\}\s*from\s*["']\.\.\/\.\.\/api\/mdata["']/.test(invoices))
    f.push(`${INVOICES}: Invoices list must import exhaustive listAllCustomers for the Customer filter`);
  if (!/listAllCustomers\(\s*\{[\s\S]{0,240}?operating_company_id:\s*selectedCompanyId/.test(invoices))
    f.push(`${INVOICES}: Customer filter must call listAllCustomers with selectedCompanyId scope`);
  if (/\blistCustomers\s*\(/.test(invoices))
    f.push(`${INVOICES}: Customer filter must not regress to the capped listCustomers roster`);
  if (!/customer_id:\s*customerId\s*\|\|\s*undefined/.test(invoices))
    f.push(`${INVOICES}: Invoices list must wire customer_id (customerId) into listInvoices`);
  if (!/All customers/.test(invoices)) f.push(`${INVOICES}: Invoices list must have an "All customers" Customer filter option`);

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const bills = read(BILLS);
  const invoices = read(INVOICES);
  const missing = [];
  if (bills === null) missing.push(`${BILLS} not found`);
  if (invoices === null) missing.push(`${INVOICES} not found`);
  if (missing.length) return missing;
  return check({ bills, invoices });
}

if (process.argv.includes("--selftest")) {
  const goodBills = `
    import { listVendors } from "../../api/mdata";
    function billDueStatus(bill) { return null; }
    function BillDueBadge() { return <span>Overdue</span>; }
    const columns = [
      { key: "due_date", label: "Due date", render: (b) => <BillDueBadge bill={b} /> },
      { key: "memo", label: "Memo" },
    ];
    listBills(companyId, { vendor_id: vendorId || undefined });
    <option value="">All vendors</option>
  `;
  const goodInvoices = `
    import { listAllCustomers } from "../../api/mdata";
    listAllCustomers({ operating_company_id: selectedCompanyId });
    const STATUS_OPTIONS = [{ value: "not_sent", label: "Not sent" }, { value: "with_balance", label: "With balance" }];
    const columns = [
      { key: "source_load_id", label: "Load #", render: (r) => <EntityLink kind="load" id={r.source_load_id} label={entityLabel(row.source_load_number, row.source_load_id, "Load")} /> },
      { key: "memo", label: "Memo" },
    ];
    listInvoices(id, { customer_id: customerId || undefined });
    <option value="">All customers</option>
  `;

  const checks = [
    ["healthy bills + invoices pass", check({ bills: goodBills, invoices: goodInvoices }).length === 0],
    ["missing bills Due date column caught", check({ bills: goodBills.replace('label: "Due date"', 'label: "Nope"'), invoices: goodInvoices }).some((x) => x.includes("Due date"))],
    ["missing bills Overdue badge caught", check({ bills: goodBills.replace(">Overdue<", ">ok<").replace("function billDueStatus", "function nope"), invoices: goodInvoices }).some((x) => x.includes("Overdue badge"))],
    ["missing bills Vendor filter caught", check({ bills: goodBills.replace("vendor_id: vendorId || undefined", ""), invoices: goodInvoices }).some((x) => x.includes("vendor_id"))],
    ["missing invoices Load # column caught", check({ bills: goodBills, invoices: goodInvoices.replace('label: "Load #"', 'label: "Nope"') }).some((x) => x.includes("Load #"))],
    ["null load label chrome caught", check({ bills: goodBills, invoices: goodInvoices.replace("row.source_load_number", "null") }).some((x) => /source_load_number|UUID chrome/.test(x))],
    ["missing invoices not_sent option caught", check({ bills: goodBills, invoices: goodInvoices.replace('value: "not_sent"', 'value: "x"') }).some((x) => x.includes("Not sent"))],
    ["missing invoices Customer filter caught", check({ bills: goodBills, invoices: goodInvoices.replace("customer_id: customerId || undefined", "") }).some((x) => x.includes("customer_id"))],
    ["capped customer roster regression caught", check({ bills: goodBills, invoices: goodInvoices.replaceAll("listAllCustomers", "listCustomers") }).some((x) => /exhaustive|capped/.test(x))],
    ["missing company scope caught", check({ bills: goodBills, invoices: goodInvoices.replace("operating_company_id: selectedCompanyId", "operating_company_id: undefined") }).some((x) => x.includes("selectedCompanyId scope"))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:qbo-parity-bills-invoices-lists --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:qbo-parity-bills-invoices-lists --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error("verify:qbo-parity-bills-invoices-lists FAIL:");
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log("verify:qbo-parity-bills-invoices-lists PASS");
}
