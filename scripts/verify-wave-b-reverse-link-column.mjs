#!/usr/bin/env node
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/safety/__tests__/EscrowRecordTab.test.tsx", /id:\s*"attempt-1",\s*driver_id:\s*driverId,/s, "safety escrow fixture preserves required driver linkage"],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="load" id=\{row\.id\}/],
  // Both direct inline EntityLink and the extracted ManagementCustomerCell/ManagementVendorCell
  // components (honest-label + tombstone handling, internally wire kind/id — see their own
  // definitions) called with customerId={row.customer_id} / vendorId={row.vendor_id} are accepted.
  [
    "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    /<EntityLink kind="customer" id=\{row\.customer_id\}|(?=[\s\S]*<ManagementCustomerCell customerId=\{row\.customer_id\})(?=[\s\S]*function ManagementCustomerCell[\s\S]{0,600}kind="customer" id=\{customerId\})/,
  ],
  [
    "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    /<EntityLink kind="vendor" id=\{row\.vendor_id\}|(?=[\s\S]*<ManagementVendorCell vendorId=\{row\.vendor_id\})(?=[\s\S]*function ManagementVendorCell[\s\S]{0,600}kind="vendor" id=\{vendorId\})/,
  ],
  ["apps/frontend/src/pages/banking/BankReconciliationPage.tsx", /<EntityLink kind="journal_entry" id=\{entry\.journal_entry_id\}/],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", /<EntityLink kind="unit" id=\{row\.equipment_id\}/],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", /<EntityLink kind="vendor" id=\{row\.lender_vendor_id\}/],
];
const failures = checks.filter(([file, re]) => !re.test(fs.readFileSync(file, "utf8"))).map(([file]) => `${file}: canonical reverse link missing`);
if (failures.length) {
  console.error(`verify-wave-b-reverse-link-column FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-b-reverse-link-column PASS — Home, Reports, Banking, and Factoring reverse links ratcheted");
