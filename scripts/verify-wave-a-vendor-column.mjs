#!/usr/bin/env node
/** @matrix-built {"modules":["factoring","finance","reports","accounting","maintenance"],"cols":["vendor"],"leafRe":"^(home\\.vendor_merges|nav\\.ar_ap_aging|report\\.ap_aging|bills\\.create\\.vendor|maintenance\\.modal\\.create_work_order)$","task":"WAVE-A-vendor-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["duplicate source-vendor drill", "apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx", /<EntityLink kind="vendor" id=\{p\.from_vendor_id\} label=\{p\.from_vendor_name\}/],
  ["duplicate target-vendor drill", "apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx", /<EntityLink kind="vendor" id=\{p\.to_vendor_id\} label=\{p\.to_vendor_name\}/],
  ["finance aging vendor drill", "apps/frontend/src/pages/finance/ArApAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\} label=\{entityLabel\(r\.vendor_name, r\.vendor_id, "Vendor"\)\}/],
  ["AP aging vendor drill", "apps/frontend/src/pages/reports/APAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\} label=\{entityLabel\(r\.vendor_name, r\.vendor_id, "Vendor"\)\}/],
  ["vendor bill create FK", "apps/frontend/src/components/accounting/VendorBillForm.tsx", /vendor_id:\s*vendorKey/],
  ["insurance policy vendor FK", "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /insurer_vendor_id:\s*id/],
  ["accident report vendor FK", "apps/frontend/src/components/safety/AccidentReportDrawer.tsx", /vendor_id:\s*vendorId\s*\|\|\s*null/],
  ["work-order create vendor FK", "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", /vendor_id:\s*values\.vendor_id\s*\|\|\s*undefined/],
];
const files = [...new Set(checks.map(([, file]) => file))];
const original = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks.filter(([, file, pattern]) => !pattern.test(sources.get(file) ?? "")).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-wave-a-vendor-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, file, pattern] of checks) {
    const mutated = new Map(original);
    const allMatches = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    mutated.set(file, original.get(file).replace(allMatches, "__PLANTED_VENDOR_COLUMN_DEFECT__"));
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-wave-a-vendor-column SELFTEST PASS — ${caught}/${checks.length} exact vendor mutations detected`);
  process.exit(0);
}

console.log("verify-wave-a-vendor-column PASS — vendor create FKs and reverse links ratcheted across the vertical matrix");
