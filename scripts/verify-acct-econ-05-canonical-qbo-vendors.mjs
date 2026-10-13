#!/usr/bin/env node
/**
 * ACCT-ECON-05 — vendor-credit / CC bill-pay paths must read canonical mdata.qbo_vendors,
 * and inbound QBO vendor writers must persist there, never in RETIRE accounting.qbo_vendors (Rule 14).
 *
 * Usage: node scripts/verify-acct-econ-05-canonical-qbo-vendors.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-econ-05-canonical-qbo-vendors";

const CC_PAYMENT = "apps/backend/src/bill-payments/cc-payment.routes.ts";
const VENDOR_CREDITS = "apps/backend/src/accounting/vendor-credits.routes.ts";
const VENDORS_PULLER = "apps/backend/src/qbo-sync/vendors-puller.ts";
const MASTER_DATA_SYNC = "apps/backend/src/qbo/master-data-sync.service.ts";

// ACCT-F4431380 (Lead 443.137 item 9e) — OLD: the CC bill-pay route had to SELECT qbo_id from the canonical
//   mdata.qbo_vendors (never the RETIRE accounting.qbo_vendors) to build a QuickBooks BillPayment push.
//   NEW: the route has no QuickBooks branch at all — it must read NEITHER vendor mirror, stamp no
//   qbo_bill_payment_id onto the native payment and queue no qbo.* event. The RETIRE-table check is kept.
//   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
export function assertCcPayment(src) {
  const problems = [];
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  if (/FROM\s+accounting\.qbo_vendors/i.test(code)) {
    problems.push(`${CC_PAYMENT}: still SELECTs RETIRE accounting.qbo_vendors — repoint to mdata.qbo_vendors`);
  }
  if (/FROM\s+mdata\.qbo_vendors/i.test(code)) {
    problems.push(`${CC_PAYMENT}: must not read the QBO vendor mirror — CC bill-pay is TMS-native only (QuickBooks is a read-only archive)`);
  }
  if (/qbo_bill_payment_id\s*=|["'`]qbo\.cc_bill_payment/i.test(code)) {
    problems.push(`${CC_PAYMENT}: must not stamp a qbo_bill_payment_id or queue a qbo.* push for a native CC payment`);
  }
  return problems;
}

export function assertVendorCredits(src) {
  const problems = [];
  if (/FROM\s+accounting\.qbo_vendors/i.test(src) || /INTO\s+accounting\.qbo_vendors/i.test(src)) {
    problems.push(`${VENDOR_CREDITS}: must not touch RETIRE accounting.qbo_vendors`);
  }
  return problems;
}

export function assertVendorsPuller(src) {
  const problems = [];
  if (/INSERT\s+INTO\s+accounting\.qbo_vendors/i.test(src)) {
    problems.push(`${VENDORS_PULLER}: inbound pull must not INSERT into RETIRE accounting.qbo_vendors`);
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_vendors/i.test(src)) {
    problems.push(`${VENDORS_PULLER}: inbound pull must INSERT into canonical mdata.qbo_vendors`);
  }
  return problems;
}

export function assertMasterDataVendorSync(src) {
  const problems = [];
  if (/accounting\.qbo_vendors/i.test(src)) {
    problems.push(`${MASTER_DATA_SYNC}: vendor sync must not read or write RETIRE accounting.qbo_vendors`);
  }
  if (!/entity\s*===\s*"vendor"\s*\?\s*"mdata\.qbo_vendors"/i.test(src)) {
    problems.push(`${MASTER_DATA_SYNC}: vendor delta cursor must read canonical mdata.qbo_vendors`);
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_vendors/i.test(src)) {
    problems.push(`${MASTER_DATA_SYNC}: vendor sync must INSERT into canonical mdata.qbo_vendors`);
  }
  if (!/WHERE\s+mdata\.qbo_vendors\.qbo_sync_token\s+IS\s+DISTINCT\s+FROM\s+EXCLUDED\.qbo_sync_token/i.test(src)) {
    problems.push(`${MASTER_DATA_SYNC}: canonical vendor UPSERT must qualify mdata.qbo_vendors`);
  }
  return problems;
}

function main() {
  const cc = fs.readFileSync(path.join(ROOT, CC_PAYMENT), "utf8");
  const vc = fs.readFileSync(path.join(ROOT, VENDOR_CREDITS), "utf8");
  const puller = fs.readFileSync(path.join(ROOT, VENDORS_PULLER), "utf8");
  const masterDataSync = fs.readFileSync(path.join(ROOT, MASTER_DATA_SYNC), "utf8");
  const problems = [
    ...assertCcPayment(cc),
    ...assertVendorCredits(vc),
    ...assertVendorsPuller(puller),
    ...assertMasterDataVendorSync(masterDataSync),
  ];
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — CC bill-pay has no QuickBooks branch (9e); vendor-credit + inbound vendor writers use canonical mdata.qbo_vendors`
  );
}

function selftest() {
  const puller = fs.readFileSync(path.join(ROOT, VENDORS_PULLER), "utf8");
  const masterDataSync = fs.readFileSync(path.join(ROOT, MASTER_DATA_SYNC), "utf8");
  const failures = [];
  const bad = assertCcPayment(`SELECT qbo_id FROM accounting.qbo_vendors WHERE id = $1`);
  if (!bad.some((p) => /RETIRE accounting/.test(p))) failures.push("did not catch retire SELECT");
  // ACCT-F4431380 (9e): the REAL route must pass; planting the old QBO branch (canonical mirror read, fabricated
  // qbo_bill_payment_id stamp) into it must each be caught.
  const cc = fs.readFileSync(path.join(ROOT, CC_PAYMENT), "utf8");
  const good = assertCcPayment(cc);
  if (good.length) failures.push(`false positive on real cc-payment route: ${good.join("; ")}`);
  if (!assertCcPayment(cc + "\nconst P = `SELECT qbo_id FROM mdata.qbo_vendors WHERE id::text = $2`;\n").some((p) => /must not read the QBO vendor mirror/.test(p))) {
    failures.push("did not catch a planted mdata.qbo_vendors read in the CC route");
  }
  if (!assertCcPayment(cc + "\nconst P = `UPDATE accounting.bill_payments SET qbo_bill_payment_id = $3 WHERE id = $1`;\n").some((p) => /must not stamp/.test(p))) {
    failures.push("did not catch a planted qbo_bill_payment_id stamp in the CC route");
  }
  const retiredPuller = puller.replace("INSERT INTO mdata.qbo_vendors", "INSERT INTO accounting.qbo_vendors");
  if (retiredPuller === puller) failures.push("puller mutation was inert");
  if (!assertVendorsPuller(retiredPuller).some((p) => /RETIRE/.test(p))) failures.push("did not catch retire inbound pull INSERT");
  if (assertVendorsPuller(puller).length) failures.push("false positive on corrected inbound puller");
  const retiredMasterDataSync = masterDataSync
    .replace('"mdata.qbo_vendors"', '"accounting.qbo_vendors"')
    .replace("INSERT INTO mdata.qbo_vendors", "INSERT INTO accounting.qbo_vendors")
    .replace("WHERE mdata.qbo_vendors.qbo_sync_token", "WHERE accounting.qbo_vendors.qbo_sync_token");
  if (retiredMasterDataSync === masterDataSync) failures.push("master-data sync mutation was inert");
  if (!assertMasterDataVendorSync(retiredMasterDataSync).some((p) => /RETIRE/.test(p))) {
    failures.push("did not catch retire master-data vendor sync");
  }
  if (assertMasterDataVendorSync(masterDataSync).length) failures.push("false positive on corrected master-data vendor sync");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`, failures);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
