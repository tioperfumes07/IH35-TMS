#!/usr/bin/env node
/** @matrix-built {"modules":["lists","dispatch","factoring","customers","vendors","safety","accounting","banking","settlements","maintenance","insurance","legal","fleet","fuel","driver-hub","cash-flow","reports","finance"],"cols":["vendor"],"leafRe":".*","task":"WAVE-A-vendor","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx", /<EntityLink kind="vendor" id=\{p\.from_vendor_id\} label=\{p\.from_vendor_name\}/],
  ["apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx", /<EntityLink kind="vendor" id=\{p\.to_vendor_id\} label=\{p\.to_vendor_name\}/],
  ["apps/frontend/src/pages/finance/ArApAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\} label=\{entityLabel\(r\.vendor_name, r\.vendor_id, "Vendor"\)\}/],
  ["apps/frontend/src/pages/reports/APAgingPage.tsx", /<EntityLink kind="vendor" id=\{r\.vendor_id\} label=\{entityLabel\(r\.vendor_name, r\.vendor_id, "Vendor"\)\}/],
  ["apps/frontend/src/components/accounting/VendorBillForm.tsx", /vendor_id:\s*vendorKey/],
  ["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /insurer_vendor_id:\s*id/],
  ["apps/frontend/src/components/safety/AccidentReportDrawer.tsx", /vendor_id:\s*vendorId\s*\|\|\s*null/],
  ["apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", /vendor_id:\s*values\.vendor_id\s*\|\|\s*undefined/],
];

const failures = checks
  .filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8")))
  .map(([file]) => `${file}: vendor FK/link contract missing`);

if (failures.length) {
  console.error(`verify-wave-a-vendor-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-wave-a-vendor-column PASS — vendor create FKs and reverse links ratcheted across the vertical matrix");
