#!/usr/bin/env node
/**
 * CLOSURE-14-DEEP-AUDIT-A — static guard for Vendor list + VendorDetail per-button surfaces.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const vendorsListPath = path.join(repoRoot, "apps/frontend/src/pages/Vendors.tsx");
const vendorDetailPath = path.join(repoRoot, "apps/frontend/src/pages/VendorDetail.tsx");
const auditPath = path.join(repoRoot, "docs/audits/DEEP-AUDIT-A-VENDOR-DETAIL.md");

const listSource = fs.readFileSync(vendorsListPath, "utf8");
const detailSource = fs.readFileSync(vendorDetailPath, "utf8");
const audit = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, "utf8") : "";
const failures = [];

const requiredListTabs = ["transaction_list", "vendor_details", "notes"];
for (const tabId of requiredListTabs) {
  if (!listSource.includes(`id: "${tabId}"`)) {
    failures.push(`Vendors.tsx missing tab id: "${tabId}"`);
  }
}
if (!listSource.includes("listBills(companyId")) {
  failures.push("Vendors transaction_list must query listBills");
}

const requiredDetailTabs = ["Profile", "A/P", "Documents", "Audit History"];
for (const tab of requiredDetailTabs) {
  if (!detailSource.includes(`"${tab}"`)) {
    failures.push(`VendorDetail.tsx missing tab: ${tab}`);
  }
}
if (!detailSource.includes("setProfileEditMode(true)")) {
  failures.push("VendorDetail Profile must expose Edit → profileEditMode");
}
if (!detailSource.includes("setProfileEditMode(false)")) {
  failures.push("VendorDetail Profile must expose Cancel → exit profileEditMode");
}
if (!detailSource.includes("updateVendorMutation")) {
  failures.push("VendorDetail Profile must wire Save → updateVendor");
}
// #23768 (2026-10-01, ORDERS-2026-10-01-CURSOR.md §4 "bills + AP READ ONLY"): the vendor profile no longer writes bill
// payments — "Remove Record Bill Payment write UI/mutation; readonly banner + Pay bills link". The A/P tab must keep the
// read-only banner AND a working link that pays THIS vendor's bills; the old in-profile submit is still accepted.
export function apPaymentPathFailures(src) {
  if (src.includes("recordVendorBillPayment")) return [];
  const out = [];
  if (!src.includes('data-testid="vendor-record-bill-payment-disabled"')) out.push("VendorDetail A/P must show the read-only bill-payment banner");
  if (!/to=\{`\/accounting\/bill-payments\?vendor_id=\$\{encodeURIComponent\(id\)\}`\}/.test(src)) {
    out.push("VendorDetail A/P must link to Accounting → Pay bills for this vendor (/accounting/bill-payments?vendor_id=)");
  }
  return out;
}
failures.push(...apPaymentPathFailures(detailSource));
if (process.argv.includes("--selftest")) {
  const plants = [
    detailSource.replace('data-testid="vendor-record-bill-payment-disabled"', 'data-testid="x"'),
    detailSource.replace("/accounting/bill-payments?vendor_id=", "/accounting/nowhere?vendor_id="),
  ];
  for (const [i, m] of plants.entries()) {
    if (m === detailSource || apPaymentPathFailures(m).length === 0) { console.error(`deep-audit-a-vendor-buttons SELFTEST FAILED — plant ${i + 1} escaped`); process.exit(1); }
  }
  console.log(`deep-audit-a-vendor-buttons SELFTEST PASS — ${plants.length} plants caught`);
}
if (!detailSource.includes("verifySaferMutation")) {
  failures.push("VendorDetail must retain Verify SAFER action");
}
if (!detailSource.includes("patchVendorAccountingCategory")) {
  failures.push("VendorDetail must retain Save category action");
}

for (const section of ["Transaction List", "Vendor Detail", "CRITICAL", "HIGH"]) {
  if (!audit.includes(section)) {
    failures.push(`audit doc missing required section: ${section}`);
  }
}

if (failures.length > 0) {
  console.error("deep-audit-a-vendor-buttons — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("deep-audit-a-vendor-buttons — OK (list + detail button surfaces enumerated)");
