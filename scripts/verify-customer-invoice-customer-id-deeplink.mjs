#!/usr/bin/env node
/**
 * verify-customer-invoice-customer-id-deeplink.mjs  (audit gap #11)
 *
 * Root cause: Customers hub "New transaction" navigated to
 *   /accounting/invoices?customer_id=<id>
 * but InvoicesListPage initialized customerId to "" and never read useSearchParams —
 * so the deep link was silently dropped (unfiltered invoice list).
 *
 * UI root fix is already on origin/main (InvoicesListPage seeds from searchParams;
 * Customers.tsx emits ?customer_id=). This guard locks emit + consume so the
 * regression cannot return:
 *   1. Customers.tsx must navigate with /accounting/invoices?customer_id=
 *   2. InvoicesListPage must use useSearchParams
 *   3. InvoicesListPage must seed customerId from searchParams.get("customer_id")
 *   4. InvoicesListPage must pass customer_id: customerId into listInvoices
 *
 * Usage:
 *   node scripts/verify-customer-invoice-customer-id-deeplink.mjs            # scan
 *   node scripts/verify-customer-invoice-customer-id-deeplink.mjs --selftest # planted-bug harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-invoice-customer-id-deeplink";
const CUSTOMERS = "apps/frontend/src/pages/Customers.tsx";
const INVOICES = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ customers, invoices }) {
  const f = [];

  if (!customers) {
    f.push(`${CUSTOMERS}: missing`);
  } else if (!/\/accounting\/invoices\?customer_id=/.test(customers)) {
    f.push(
      `${CUSTOMERS}: "New transaction" must navigate to /accounting/invoices?customer_id= (emit deep link)`,
    );
  }

  if (!invoices) {
    f.push(`${INVOICES}: missing`);
    return f;
  }

  if (!/useSearchParams/.test(invoices)) {
    f.push(`${INVOICES}: must use useSearchParams to honor ?customer_id=`);
  }
  if (!/searchParams\.get\(\s*["']customer_id["']\s*\)/.test(invoices)) {
    f.push(`${INVOICES}: must seed customer filter from searchParams.get("customer_id")`);
  }
  if (!/customer_id:\s*customerId\s*\|\|\s*undefined/.test(invoices)) {
    f.push(`${INVOICES}: must wire customer_id (customerId) into listInvoices`);
  }

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
  return check({ customers: read(CUSTOMERS), invoices: read(INVOICES) });
}

if (process.argv.includes("--selftest")) {
  const goodCustomers = `
    navigate(\`/accounting/invoices?customer_id=\${selectedCustomer.id}\`)
    New transaction
  `;
  const goodInvoices = `
    import { useNavigate, useSearchParams } from "react-router-dom";
    const [searchParams] = useSearchParams();
    const [customerId, setCustomerId] = useState(() => searchParams.get("customer_id") ?? "");
    listInvoices(id, { customer_id: customerId || undefined });
  `;

  const checks = [
    ["healthy emit + consume pass", check({ customers: goodCustomers, invoices: goodInvoices }).length === 0],
    [
      "missing Customers emit caught",
      check({
        customers: goodCustomers.replace("/accounting/invoices?customer_id=", "/accounting/invoices"),
        invoices: goodInvoices,
      }).some((x) => x.includes("navigate")),
    ],
    [
      "missing useSearchParams caught",
      check({
        customers: goodCustomers,
        invoices: goodInvoices.replace(/useSearchParams/g, "useParams"),
      }).some((x) => x.includes("useSearchParams")),
    ],
    [
      "missing searchParams.get(customer_id) caught",
      check({
        customers: goodCustomers,
        invoices: goodInvoices.replace('searchParams.get("customer_id")', 'searchParams.get("status")'),
      }).some((x) => x.includes('searchParams.get("customer_id")')),
    ],
    [
      "missing listInvoices customer_id wire caught",
      check({
        customers: goodCustomers,
        invoices: goodInvoices.replace("customer_id: customerId || undefined", ""),
      }).some((x) => x.includes("listInvoices")),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — Customers New transaction emits ?customer_id= and InvoicesListPage honors it`,
  );
  process.exit(0);
}
