#!/usr/bin/env node
// verify-qbo-ar-invoices-inbound — Cursor band 1753.
//
// FINDING: payment_applications=0 while payments dense — Stage 2b joins invoices.qbo_invoice_id but
// there was no inbound QBO Invoice mirror (mdata.qbo_invoices is outbound-only). This guard pins:
//   - mdata.qbo_ar_invoices + default-OFF flags + TRANSP enable migration
//   - puller paginates Invoice + projects accounting.invoices
//   - scheduler wires ar_invoices_pull/project BEFORE ar_payments_project

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PULLER = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-ar-invoices-puller.ts");
const KIND = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-ar-invoices-sync-kind.ts");
const SCHEDULER = path.join(ROOT, "apps/backend/src/qbo-sync/sync-scheduler.ts");
const MIG_MIRROR = path.join(ROOT, "db/migrations/202610191200_qbo_ar_invoices_inbound_mirror.sql");
const MIG_ENABLE = path.join(ROOT, "db/migrations/202610191400_enable_qbo_ar_invoice_flags_transp.sql");

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function analyze() {
  const failures = [];
  const puller = read(PULLER);
  const kind = read(KIND);
  const scheduler = read(SCHEDULER);
  const migMirror = read(MIG_MIRROR);
  const migEnable = read(MIG_ENABLE);

  if (!puller) failures.push("missing qbo-ar-invoices-puller.ts");
  if (!kind) failures.push("missing qbo-ar-invoices-sync-kind.ts");
  if (!scheduler) failures.push("missing sync-scheduler.ts");
  if (!migMirror) failures.push("missing 202610191200_qbo_ar_invoices_inbound_mirror.sql");
  if (!migEnable) failures.push("missing 202610191400_enable_qbo_ar_invoice_flags_transp.sql");
  if (failures.length) return failures;

  if (!/mdata\.qbo_ar_invoices/.test(migMirror)) failures.push("mirror migration must CREATE mdata.qbo_ar_invoices");
  if (!/FORCE ROW LEVEL SECURITY/.test(migMirror)) failures.push("mirror table must FORCE ROW LEVEL SECURITY");
  if (!/QBO_AR_INVOICE_MIRROR_PULL_ENABLED/.test(migMirror) || !/QBO_AR_INVOICES_PROJECTION_ENABLED/.test(migMirror)) {
    failures.push("mirror migration must register both stage flags");
  }
  if (!/QBO_AR_INVOICE_MIRROR_PULL_ENABLED[\s\S]*?false\s*,\s*0/.test(migMirror)) {
    failures.push("QBO_AR_INVOICE_MIRROR_PULL_ENABLED must register default_enabled=false");
  }
  if (!/QBO_AR_INVOICES_PROJECTION_ENABLED[\s\S]*?false\s*,\s*0/.test(migMirror)) {
    failures.push("QBO_AR_INVOICES_PROJECTION_ENABLED must register default_enabled=false");
  }
  if (!/QBO_AR_INVOICE_MIRROR_PULL_ENABLED/.test(migEnable) || !/QBO_AR_INVOICES_PROJECTION_ENABLED/.test(migEnable)) {
    failures.push("TRANSP enable migration must arm both invoice flags");
  }

  if (!/export async function pullArInvoicesFromQbo/.test(puller)) failures.push("puller missing pullArInvoicesFromQbo");
  if (!/export async function projectArInvoicesToLedger/.test(puller)) failures.push("puller missing projectArInvoicesToLedger");
  if (!/qboPaginateEntity[\s\S]{0,80}"Invoice"/.test(puller)) failures.push("puller must paginate QBO entity Invoice");
  if (!/INSERT\s+INTO\s+accounting\.invoices/.test(puller)) failures.push("projector must INSERT INTO accounting.invoices");
  if (/INSERT\s+INTO\s+accounting\.invoices[\s\S]{0,500}amount_open_cents/i.test(puller)) {
    failures.push("projector must NOT insert GENERATED amount_open_cents");
  }
  if (!/INNER JOIN mdata\.customers/.test(puller)) failures.push("projector must INNER JOIN mdata.customers (skip unresolved)");
  // sql-read-targets binds the first alias for a table in a SQL string. Reusing `c` for
  // mdata.customers AND later for the candidates CTE falsely flags cand columns as customer phantoms.
  if (!/INNER JOIN mdata\.customers cust\b/.test(puller)) {
    failures.push("projector must alias mdata.customers as cust (not c) for sql-read-targets");
  }
  if (!/FROM candidates cand\b/.test(puller)) {
    failures.push("projector must alias candidates CTE as cand (not c) for sql-read-targets");
  }
  if (/INNER JOIN mdata\.customers c\b/.test(puller) || /FROM candidates c\b/.test(puller)) {
    failures.push("projector must not reuse alias c for customers or candidates (sql-read-targets collision)");
  }
  if (!/INV-' \|\|/.test(puller)) failures.push("projector must mint INV-YYYY-NNNNN display_ids for new rows");
  if (!/QBO_AR_INVOICES_MIRROR_SYNC_KIND/.test(kind) || !/QBO_AR_INVOICES_PROJECTION_SYNC_KIND/.test(kind)) {
    failures.push("sync-kind constants missing");
  }
  if (!/pullArInvoicesFromQbo/.test(scheduler) || !/projectArInvoicesToLedger/.test(scheduler)) {
    failures.push("sync-scheduler must wire invoice pull + project steps");
  }
  if (!/ar_invoices_pull/.test(scheduler) || !/ar_invoices_project/.test(scheduler)) {
    failures.push("sync-scheduler step names ar_invoices_pull/project required");
  }
  // Ordering: invoices project must appear before ar_payments_project
  const invIdx = scheduler.indexOf('runStep("ar_invoices_project"');
  const payIdx = scheduler.indexOf('runStep("ar_payments_project"');
  if (invIdx < 0 || payIdx < 0 || invIdx > payIdx) {
    failures.push("ar_invoices_project must be scheduled before ar_payments_project");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const real = analyze();
  if (real.length !== 0) failures.push(`real tree flagged when it should PASS: ${real.join(" | ")}`);

  const puller = read(PULLER);
  if (/qboPaginateEntity[\s\S]{0,80}"Invoice"/.test(puller.replace(/"Invoice"/g, '"Purchase"'))) {
    failures.push("selftest: renamed entity still matched Invoice");
  }

  if (failures.length) {
    console.error("verify-qbo-ar-invoices-inbound --selftest: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-qbo-ar-invoices-inbound --selftest: PASS");
  process.exit(0);
}

const failures = analyze();
if (failures.length) {
  console.error("verify-qbo-ar-invoices-inbound: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-qbo-ar-invoices-inbound: PASS — mirror+flags+puller+projector+scheduler wired (payment_applications unblock)");
process.exit(0);
