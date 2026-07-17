#!/usr/bin/env node
/**
 * verify-entitylink-deep-links.mjs
 *
 * GUARD 2026-07-16 (audit gap #6): query-param drill-throughs must land on a page that
 * honors the param. Dead "View audit log" / fault-history links looked wired but dropped
 * the id silently.
 *
 * Static invariants (no DB, no network):
 *  1. InvoiceDetailPage customer header → EntityLink kind="customer" id={invoice.customer_id}
 *  2. InvoiceDetailPage "View audit log" → /accounting/audit-trail?source_type=invoice&source_id=
 *  3. PaymentDetailPage "View audit log" → /accounting/audit-trail?source_type=customer_payment&source_id=
 *  4. AccountingAuditTrailPage seeds filters from ?source_type=&source_id=
 *  5. FaultDraftsPage reads ?unit_id= (MaintenanceSnapshotSection emits it)
 *  6. No regression to /reports?invoice_id= or /reports?payment_id=
 *  7. EntityLink expense ≠ null → /accounting/expenses/list?expense_id= (Desktop audit
 *     99-CROSSCUTTING-ENTITYLINK WILL FAIL); ExpensesListPage honors ?expense_id=; WO detail
 *     producer uses EntityLink kind="expense". No ExpenseDetailPage invent — list deep-link only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entitylink-deep-links";

const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`MISSING ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const invoice = read("apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx");
const payment = read("apps/frontend/src/pages/accounting/PaymentDetailPage.tsx");
const audit = read("apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx");
const faults = read("apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx");
const entityLink = read("apps/frontend/src/components/shared/EntityLink.tsx");
const expensesList = read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx");
const woDetail = read("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx");
const manifest = read("apps/frontend/src/routes/manifest.tsx");

if (invoice) {
  if (!/EntityLink kind="customer" id=\{invoice\.customer_id\}/.test(invoice)) {
    failures.push("InvoiceDetailPage: customer header must use EntityLink kind=customer id=invoice.customer_id");
  }
  if (/\/reports\?invoice_id=/.test(invoice)) {
    failures.push("InvoiceDetailPage: must not navigate to /reports?invoice_id= (dead param)");
  }
  if (!/\/accounting\/audit-trail\?source_type=invoice&source_id=/.test(invoice)) {
    failures.push("InvoiceDetailPage: View audit log must go to /accounting/audit-trail?source_type=invoice&source_id=");
  }
}

if (payment) {
  if (/\/reports\?payment_id=/.test(payment)) {
    failures.push("PaymentDetailPage: must not navigate to /reports?payment_id= (dead param)");
  }
  if (!/\/accounting\/audit-trail\?source_type=customer_payment&source_id=/.test(payment)) {
    failures.push(
      "PaymentDetailPage: View audit log must go to /accounting/audit-trail?source_type=customer_payment&source_id=",
    );
  }
}

if (audit) {
  if (!/useSearchParams/.test(audit)) {
    failures.push("AccountingAuditTrailPage: must use useSearchParams for deep-link filters");
  }
  if (!/searchParams\.get\(["']source_type["']\)/.test(audit)) {
    failures.push("AccountingAuditTrailPage: must seed sourceType from ?source_type=");
  }
  if (!/searchParams\.get\(["']source_id["']\)/.test(audit)) {
    failures.push("AccountingAuditTrailPage: must seed sourceId from ?source_id=");
  }
}

if (faults) {
  if (!/useSearchParams/.test(faults)) {
    failures.push("FaultDraftsPage: must use useSearchParams");
  }
  if (!/searchParams\.get\(["']unit_id["']\)/.test(faults)) {
    failures.push("FaultDraftsPage: must honor ?unit_id= from vehicle profile fault history");
  }
}

// Desktop audit 99-CROSSCUTTING-ENTITYLINK: expense must never resolve to null.
if (entityLink) {
  if (/case\s+["']expense["']\s*:\s*return\s+null/.test(entityLink)) {
    failures.push('EntityLink: case "expense" must not return null (WILL FAIL drill-through)');
  }
  if (!/case\s+["']expense["']\s*:\s*return\s+`\/accounting\/expenses\/list\?expense_id=\$\{id\}`/.test(entityLink)) {
    failures.push(
      'EntityLink: case "expense" must resolve to `/accounting/expenses/list?expense_id=${id}` (no fake detail page)',
    );
  }
}

if (expensesList) {
  if (!/useSearchParams/.test(expensesList)) {
    failures.push("ExpensesListPage: must use useSearchParams to honor EntityLink expense deep-links");
  }
  if (!/searchParams\.get\(["']expense_id["']\)/.test(expensesList)) {
    failures.push("ExpensesListPage: must honor ?expense_id= (EntityLink consumer)");
  }
  if (!/kind=["']expense["']/.test(expensesList)) {
    failures.push("ExpensesListPage: expense # column must render EntityLink kind=\"expense\"");
  }
}

if (woDetail) {
  if (!/EntityLink\s+kind=["']expense["']/.test(woDetail)) {
    failures.push('WorkOrderDetailPage: expense producer must use <EntityLink kind="expense" …>');
  }
  // Forbid the pre-fix dead producer that landed on the create page and ignored the id.
  if (/to=\{`?\/accounting\/expenses\?expense_id=/.test(woDetail) || /to=["']\/accounting\/expenses\?expense_id=/.test(woDetail)) {
    failures.push(
      "WorkOrderDetailPage: must not link /accounting/expenses?expense_id= (create page ignores param)",
    );
  }
}

if (manifest) {
  if (!/path=["']\/accounting\/expenses\/list["']/.test(manifest)) {
    failures.push("manifest: /accounting/expenses/list route must exist for expense EntityLink target");
  }
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — invoice customer + audit log + fault drafts unit_id + expense EntityLink deep-links honored`,
);
process.exit(0);
