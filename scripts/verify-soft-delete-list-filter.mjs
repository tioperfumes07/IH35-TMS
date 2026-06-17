#!/usr/bin/env node
// Guard (queue #3 SOFT-DELETE): the Customers and Vendors list pages must keep an
// Active/Inactive list filter driven by the canonical `deactivated_at` soft-delete
// field (mirroring the Driver Deactivate pattern). Prevents silent regression back
// to a single unfiltered list that hides the active/inactive distinction.
import { readFileSync } from "node:fs";

const targets = [
  { file: "apps/frontend/src/pages/Customers.tsx", marker: 'data-list-status-filter="customers"', memo: "visibleCustomers" },
  { file: "apps/frontend/src/pages/Vendors.tsx", marker: 'data-list-status-filter="vendors"', memo: "visibleVendors" },
];

const failures = [];
for (const t of targets) {
  let src = "";
  try {
    src = readFileSync(t.file, "utf8");
  } catch {
    failures.push(`${t.file}: file missing`);
    continue;
  }
  if (!src.includes(t.marker)) failures.push(`${t.file}: missing list-status filter control (${t.marker})`);
  if (!src.includes(t.memo)) failures.push(`${t.file}: missing ${t.memo} chokepoint memo`);
  if (!src.includes("deactivated_at != null") || !src.includes("deactivated_at == null")) {
    failures.push(`${t.file}: filter must branch on deactivated_at (canonical soft-delete field)`);
  }
}

if (failures.length) {
  console.error("verify:soft-delete-list-filter — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:soft-delete-list-filter — OK (Customers + Vendors Active/Inactive filters present)");
