#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["ap_bill"],"leafRe":"^accounting\\.panel\\.reallocate$","task":"VERTICAL-AP-BILL-INLINE-SURFACES"} */
/** @matrix-built {"modules":["settlements"],"cols":["ap_bill"],"leafRe":"^settlements\\.panel\\.open_driver_bills$","task":"VERTICAL-AP-BILL-INLINE-SURFACES"} */
import fs from "node:fs";
const allocation = fs.readFileSync("apps/frontend/src/components/allocation/BillAllocationPanel.tsx", "utf8");
const settlements = fs.readFileSync("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx", "utf8");
const failures = (a = allocation, s = settlements) => [
  ["reallocation source bill drill", a.includes('<EntityLink kind="bill" id={billId} label={billLabel} />')],
  ["open driver bill drill", s.includes('<EntityLink kind="bill" id={bill.id} label={entityLabel(bill.bill_number, bill.id, "Bill")} />')],
].filter(([, ok]) => !ok).map(([name]) => name);
if (process.argv.includes("--selftest")) {
  if (!failures(allocation.replace('kind="bill"', 'kind="broken"')).includes("reallocation source bill drill")) process.exit(1);
  console.log("verify-ap-bill-inline-surface-linkage selftest PASS — source bill mutation red");
  process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-ap-bill-inline-surface-linkage FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-ap-bill-inline-surface-linkage PASS — both exact AP bill inline leaves drill canonical bills");
