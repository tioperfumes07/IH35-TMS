#!/usr/bin/env node
// verify-qbo-ar-invoices-inbound — Cursor even band 1756.
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

function analyze(over = {}) {
  const failures = [];
  const puller = over.puller ?? read(PULLER);
  const kind = read(KIND);
  const scheduler = over.scheduler ?? read(SCHEDULER);
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
  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: the projector had to INSERT INTO accounting.invoices (+ lines)
  //   with a C6 exemption, INNER JOIN mdata.customers, alias rules and INV- display_id minting.
  //   NEW: the projector must REFUSE BY NAME (projectArInvoicesToLedger calls refuseQboNativeWrite) and the
  //   puller must contain NO write into any accounting.* table; its only data write is the mdata.qbo_ar_invoices mirror.
  //   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
  if (!/export async function projectArInvoicesToLedger[\s\S]{0,400}refuseQboNativeWrite\(/.test(puller)) {
    failures.push("projectArInvoicesToLedger must refuse by name (refuseQboNativeWrite) — never project or silently no-op");
  }
  if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+accounting\.(?!qbo_)[a-z_]+/i.test(puller)) {
    failures.push("puller must not write any native accounting.* table (QuickBooks is a read-only archive)");
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_ar_invoices/.test(puller)) failures.push("puller must still upsert the mdata.qbo_ar_invoices mirror");
  if (/postSourceTransaction|createJournalEntry/.test(puller)) {
    failures.push("puller must not reference a GL poster — subledger-only (NO GL)");
  }
  if (!/QBO_AR_INVOICES_MIRROR_SYNC_KIND/.test(kind) || !/QBO_AR_INVOICES_PROJECTION_SYNC_KIND/.test(kind)) {
    failures.push("sync-kind constants missing");
  }
  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: scheduler wired ar_invoices_pull + ar_invoices_project, with
  //   project ordered before ar_payments_project. NEW: only ar_invoices_pull is scheduled; the refused projector
  //   must NOT be scheduled (it would record a refused step every tick). WHY: QuickBooks is a read-only archive;
  //   the projection/write was removed and its entry point refuses by name.
  if (!/pullArInvoicesFromQbo/.test(scheduler) || !/runStep\("ar_invoices_pull"/.test(scheduler)) {
    failures.push("sync-scheduler must wire the ar_invoices_pull mirror step");
  }
  if (/projectArInvoicesToLedger|"ar_invoices_project"/.test(scheduler)) {
    failures.push("sync-scheduler must NOT schedule the refused ar_invoices_project step");
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
  // ACCT-F4431380 (9e) plants on the REAL puller/scheduler source: a re-added native write, a reverted refusal,
  // and a re-scheduled projection must each be flagged.
  const scheduler = read(SCHEDULER);
  const plants = [
    ["native write planted", { puller: puller + "\nconst P = `INSERT INTO accounting.invoices (id) VALUES ($1)`;\n" }, /native accounting/],
    ["refusal reverted", { puller: puller.replace(/refuseQboNativeWrite\(/g, "noop(") }, /refuse by name/],
    ["projection re-scheduled", { scheduler: scheduler + '\nawait runStep("ar_invoices_project", id, () => projectArInvoicesToLedger(id));\n' }, /NOT schedule/],
  ];
  for (const [name, over, re] of plants) {
    if (!analyze(over).some((f) => re.test(f))) failures.push(`selftest: ${name} was NOT caught`);
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
console.log("verify-qbo-ar-invoices-inbound: PASS — mirror+flags+pull wired; projector refuses by name (QBO read-only archive, 9e)");
process.exit(0);
