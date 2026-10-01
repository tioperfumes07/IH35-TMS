#!/usr/bin/env node
/**
 * ORDERS-2026-10-01 MAINTENANCE — WO three dates as columns (reported / in shop / expected release).
 * Expected release may render "pending CC-1" until E-16 lands the column.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-maint-wo-three-dates";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  table: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  detail: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  modal: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
  api: "apps/frontend/src/api/maintenance.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const table = read(FILES.table);
  for (const label of ['label: "Reported"', 'label: "In shop"', 'label: "Expected release"']) {
    if (!table.includes(label)) f.push(`${FILES.table}: missing column ${label}`);
  }
  if (!/pending CC-1/.test(table)) f.push(`${FILES.table}: Expected release must mark pending CC-1 when column absent`);
  if (!/work_started_at/.test(table)) f.push(`${FILES.table}: In shop must bind work_started_at`);
  const detailExtra = read(FILES.detail);
  if (!/wo-detail-linked-bill-payments-parity/.test(detailExtra)) f.push(`${FILES.detail}: bill payments reverse table required`);
  if (!/wo-detail-linked-invoices-parity/.test(detailExtra)) f.push(`${FILES.detail}: invoices reverse table required`);
  if (!/wo-detail-linked-customer-payments-parity/.test(detailExtra)) f.push(`${FILES.detail}: receive payments reverse table required`);
  if (!/wo-detail-parts-links-parity/.test(detailExtra)) f.push(`${FILES.detail}: parts invoice links reverse table required`);
  if (!/resolved_customer_id/.test(detailExtra)) f.push(`${FILES.detail}: customer EntityLink required`);
  if (!/journal_entry/.test(detailExtra)) f.push(`${FILES.detail}: JE EntityLink on linked money required`);

  const detail = read(FILES.detail);
  if (!/wo-three-dates/.test(detail)) f.push(`${FILES.detail}: three-dates strip missing`);
  if (!/pending CC-1/.test(detail)) f.push(`${FILES.detail}: Expected release pending CC-1 missing`);

  const modal = read(FILES.modal);
  if (!/wo-date-reported/.test(modal) || !/wo-date-in-shop/.test(modal) || !/wo-date-expected-release/.test(modal)) {
    f.push(`${FILES.modal}: three date testids required`);
  }

  const api = read(FILES.api);
  if (!/work_started_at\?:/.test(api) || !/expected_release_at\?:/.test(api)) {
    f.push(`${FILES.api}: WorkOrder type must declare work_started_at + expected_release_at`);
  }
  return f;
}

if (SELFTEST) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — WO three dates on list + detail`);
process.exit(0);
