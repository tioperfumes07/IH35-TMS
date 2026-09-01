#!/usr/bin/env node
// Guard (queue #3 SOFT-DELETE): the Customers and Vendors list pages must keep an
// Active/Inactive list filter driven by the canonical `deactivated_at` soft-delete
// field (mirroring the Driver Deactivate pattern). Prevents silent regression back
// to a single unfiltered list that hides the active/inactive distinction.
import { readFileSync } from "node:fs";

const targets = [
  { file: "apps/frontend/src/pages/Customers.tsx", entity: "customers", memo: "visibleCustomers" },
  { file: "apps/frontend/src/pages/Vendors.tsx", entity: "vendors", memo: "visibleVendors" },
];

function hasStatusFilter(source, entity) {
  return [
    `data-list-status-filter="${entity}"`,
    `"data-list-status-filter": "${entity}"`,
  ].some((marker) => source.includes(marker));
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["direct attribute passes", '<div data-list-status-filter="customers" />', "customers", true],
    ["shared dataAttributes passes", 'dataAttributes={{ "data-list-status-filter": "customers" }}', "customers", true],
    ["wrong entity fails", 'dataAttributes={{ "data-list-status-filter": "vendors" }}', "customers", false],
    ["label-only prose fails", "customers active inactive filter", "customers", false],
  ];
  for (const [name, source, entity, expected] of cases) {
    if (hasStatusFilter(source, entity) !== expected) {
      console.error(`verify:soft-delete-list-filter — SELFTEST FAIL: ${name}`);
      process.exit(1);
    }
  }
  console.log(`verify:soft-delete-list-filter — SELFTEST PASS (${cases.length}/${cases.length})`);
  process.exit(0);
}

const failures = [];
for (const t of targets) {
  let src = "";
  try {
    src = readFileSync(t.file, "utf8");
  } catch {
    failures.push(`${t.file}: file missing`);
    continue;
  }
  if (!hasStatusFilter(src, t.entity)) {
    failures.push(`${t.file}: missing list-status filter control (data-list-status-filter=${t.entity})`);
  }
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
