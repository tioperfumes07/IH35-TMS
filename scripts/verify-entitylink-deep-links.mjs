#!/usr/bin/env node
/**
 * verify-entitylink-deep-links.mjs
 *
 * GUARD 2026-07-16 (audit gap #6): query-param drill-throughs must land on a page that
 * honors the param. Dead "View audit log" / fault-history links looked wired but dropped
 * the id silently.
 *
 * Static invariants (no DB, no network):
 *  1. InvoiceDetailPage "View audit log" → /accounting/audit-trail?source_type=invoice&source_id=
 *  2. PaymentDetailPage "View audit log" → /accounting/audit-trail?source_type=customer_payment&source_id=
 *  3. AccountingAuditTrailPage seeds filters from ?source_type=&source_id=
 *  4. FaultDraftsPage reads ?unit_id= (MaintenanceSnapshotSection emits it)
 *  5. No regression to /reports?invoice_id= or /reports?payment_id=
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

if (invoice) {
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

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — invoice/payment audit log + fault drafts unit_id deep-links honored`,
);
process.exit(0);
