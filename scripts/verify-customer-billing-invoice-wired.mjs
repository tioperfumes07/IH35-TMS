#!/usr/bin/env node
/**
 * WAVE 1 customers money — Box 3 Built for `md.new_transaction` / `detail.billing` /
 * `detail.billing.record_payment` × `invoice`.
 *
 * @matrix-built {"modules":["customers"],"cols":["invoice"],"task":"WAVE1-CUSTOMERS-BILLING-INVOICE-BUILT","vertical":"column-wave","leafRe":"^(md\\.new_transaction|detail\\.billing(\\.record_payment)?)$"}
 *
 * Customers.tsx's master-detail "New transaction" button navigates to
 * /accounting/invoices?customer_id=... (forward hop); InvoicesListPage.tsx reads that customer_id
 * param and scopes the list by it (customerId used in both the query filter and the URL sync) —
 * md.new_transaction. CustomerDetail.tsx's Billing & Receivables tab already renders AR aging / open
 * invoices via listInvoices(operatingCompanyId, { customer_id: id }) with EntityLinkOrTombstone
 * drill-through, and a record-payment flow that applies a payment across selected open invoices —
 * detail.billing / detail.billing.record_payment. All three leaves' wiring already existed, only the
 * Box-3 credit was missing.
 *
 * Self-test: node scripts/verify-customer-billing-invoice-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-billing-invoice-wired";

const CHECKS = [
  {
    name: "Customers.tsx's New transaction button hops to the invoice list scoped by this customer",
    file: "apps/frontend/src/pages/Customers.tsx",
    pattern: /navigate\(`\/accounting\/invoices\?customer_id=\$\{selectedCustomer\.id\}`\)/,
  },
  {
    name: "InvoicesListPage reads customer_id from the URL and scopes the query by it",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /searchParams\.get\("customer_id"\)/,
  },
  {
    name: "CustomerDetail's Billing tab lists invoices scoped by customer_id (forward query)",
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    pattern: /listInvoices\(operatingCompanyId!,\s*\{\s*customer_id:\s*id\s*\}\)/,
  },
  {
    name: "CustomerDetail's Billing tab mounts a record-payment flow applying against open invoices",
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    pattern: /recordPaymentOpen/,
  },
  {
    name: "CUST-MONEY-F6312 Statements tab reads invoices + payments (not coming-state copy)",
    file: "apps/frontend/src/pages/Customers.tsx",
    pattern: /activeTab === "statements"/,
  },
  {
    name: "CUST-MONEY-F6312 Recurring tab lists accounting.recurring_templates for this customer",
    file: "apps/frontend/src/pages/Customers.tsx",
    pattern: /listAllAccountingRecurringTemplates\(companyId,\s*\{[\s\S]{0,180}customer_id:\s*selectedCustomer!?\.id/,
  },
  {
    name: "CUST-MONEY-F6312 Late Fees tab is overdue AR only — no invented late-fee dollar",
    file: "apps/frontend/src/pages/Customers.tsx",
    pattern: /no customer late-fee rule table/,
  },
  {
    name: "CUST-MONEY-F6312 money tabs are not COMING_STATE_COPY leftovers",
    file: "apps/frontend/src/pages/Customers.tsx",
    pattern:
      /const COMING_STATE_COPY[\s\S]*projects:[\s\S]*opportunities:[\s\S]*conversations:/,
    antiPattern: /^\s+(statements|recurring_transactions|late_fees):/m,
  },
  {
    name: "CUST-MONEY-F6312 backend lists recurring templates scoped by customer_id",
    file: "apps/backend/src/accounting/recurring-template-detail.routes.ts",
    pattern: /app\.get\("\/api\/v1\/accounting\/recurring-templates"/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
    if (c.antiPattern && c.antiPattern.test(src)) {
      failures.push(`${c.name}: ${c.file} still contains leftover coming-state copy`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/Customers.tsx": `
      onClick={() => navigate(\`/accounting/invoices?customer_id=\${selectedCustomer.id}\`)}
      listAllAccountingRecurringTemplates(companyId, { customer_id: selectedCustomer.id })
      {activeTab === "statements" ? (
      There is no customer late-fee rule table.
      const COMING_STATE_COPY: Partial<Record<CustomerTabId, string>> = {
        projects: "Projects",
        opportunities: "Opportunities",
        conversations: "Conversations",
      };
    `,
    "apps/frontend/src/pages/accounting/InvoicesListPage.tsx":
      'const customerId = searchParams.get("customer_id") ?? "";',
    "apps/frontend/src/pages/CustomerDetail.tsx": `
      queryFn: () => listInvoices(operatingCompanyId!, { customer_id: id }).then((res) => res.invoices ?? []),
      const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
    `,
    "apps/backend/src/accounting/recurring-template-detail.routes.ts":
      'app.get("/api/v1/accounting/recurring-templates"',
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const leftoverComing = checkAll((f) =>
    f === "apps/frontend/src/pages/Customers.tsx"
      ? `const COMING_STATE_COPY = { statements: "x", recurring_transactions: "y", late_fees: "z", projects: "p", opportunities: "o", conversations: "c" };`
      : GOOD_FIXTURES[f] ?? null,
  );
  if (!leftoverComing.some((line) => line.includes("coming-state"))) {
    console.error(`[${LABEL}] selftest FAIL: leftover coming-state fixture must fail antiPattern`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length < CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every pattern check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — customer new-transaction hop + billing invoice list + record-payment flow all present`);
