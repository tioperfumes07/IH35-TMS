#!/usr/bin/env node
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/safety/__tests__/EscrowRecordTab.test.tsx", /id:\s*"attempt-1",\s*driver_id:\s*driverId,/s, "safety escrow fixture preserves required driver linkage"],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="load" id=\{row\.id\}/, "dispatcher active load exact drill"],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /function ManagementCustomerCell[\s\S]{0,600}<EntityLink kind="customer" id=\{customerId\}/, "management customer cell exact drill"],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /<ManagementCustomerCell customerId=\{row\.customer_id\}[\s\S]*<ManagementCustomerCell customerId=\{row\.customer_id\}/, "both management customer row consumers"],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /function ManagementVendorCell[\s\S]{0,600}<EntityLink kind="vendor" id=\{vendorId\}/, "management vendor cell exact drill"],
  ["apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx", /<ManagementVendorCell vendorId=\{row\.vendor_id\}[\s\S]*<ManagementVendorCell vendorId=\{row\.vendor_id\}/, "both management vendor row consumers"],
  ["apps/frontend/src/pages/banking/BankReconciliationPage.tsx", /<EntityLink kind="journal_entry" id=\{entry\.journal_entry_id\}/, "bank reconciliation JE exact drill"],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", /<EntityLink kind="unit" id=\{row\.equipment_id\}/, "equipment loan unit exact drill"],
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", /<EntityLink kind="vendor" id=\{row\.lender_vendor_id\}/, "equipment loan vendor exact drill"],
];

function readSources(root = process.cwd()) {
  return Object.fromEntries([...new Set(checks.map(([file]) => file))].map((file) => [file, fs.readFileSync(`${root}/${file}`, "utf8")]));
}

export function run(sources = readSources()) {
  return checks.filter(([file, pattern]) => !pattern.test(sources[file])).map(([, , message]) => message);
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  if (run(live).length) throw new Error(`production baseline failed: ${run(live).join("; ")}`);
  let rejected = 0;
  for (const [file, pattern, message] of checks) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const planted = live[file].replace(new RegExp(pattern.source, flags), "/* planted reverse-column defect */");
    if (planted === live[file] || !run({ ...live, [file]: planted }).includes(message)) {
      throw new Error(`mutation escaped: ${message}`);
    }
    rejected += 1;
  }
  console.log(`verify-wave-b-reverse-link-column SELFTEST PASS — ${rejected}/${checks.length} production defects rejected`);
} else {
  const failures = run();
  if (failures.length) {
    console.error(`verify-wave-b-reverse-link-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-wave-b-reverse-link-column PASS — Home, Reports, Banking, and Factoring reverse links ratcheted");
}
