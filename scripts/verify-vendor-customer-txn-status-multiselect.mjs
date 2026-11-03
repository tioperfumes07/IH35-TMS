#!/usr/bin/env node
/**
 * U12 — Vendor/Customer transaction Status filters are MultiSelectDropdown.
 * Codex batch76 — Vendor multi-status must send statusFilter.join(",") (server OR before LIMIT),
 * never drop status and client-filter the default page-100.
 */
import fs from "node:fs";

const LABEL = "verify-vendor-customer-txn-status-multiselect";
const VENDORS = "apps/frontend/src/pages/Vendors.tsx";

function checkVendorsBatch76(src) {
  const fails = [];
  // statusApiParam must join for 2+ (queryKey may also join — require the assignment path).
  if (!/statusApiParam\s*=\s*[\s\S]{0,280}?statusFilter\.join\(["'],["']\)/.test(src)) {
    fails.push(`${VENDORS}: statusApiParam must statusFilter.join(',') for multi-status listBills (Codex batch76)`);
  }
  if (/statusFilter\.length > 1[\s\S]{0,220}statusFilter\.includes\(bill\.status\)/.test(src)) {
    fails.push(`${VENDORS}: must not client-filter multi-status after LIMIT (Codex batch76)`);
  }
  if (!/status:\s*statusApiParam/.test(src)) {
    fails.push(`${VENDORS}: listBills must forward statusApiParam`);
  }
  return fails;
}

const fails = [];
for (const [file, testId] of [
  [VENDORS, "vendor-txn-status-filter"],
  ["apps/frontend/src/pages/Customers.tsx", "customers-tx-status-filter"],
]) {
  const src = fs.readFileSync(file, "utf8");
  if (!new RegExp(`data-testid="${testId}"`).test(src)) fails.push(`${file}: missing ${testId}`);
  if (!/MultiSelectDropdown/.test(src)) fails.push(`${file}: must use MultiSelectDropdown`);
  if (!/useState<string\[\]>\(\[\]\)/.test(src)) fails.push(`${file}: statusFilter must be string[]`);
}
fails.push(...checkVendorsBatch76(fs.readFileSync(VENDORS, "utf8")));

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(LABEL, "SELFTEST FAIL — live already red", fails);
    process.exit(1);
  }
  const good = fs.readFileSync(VENDORS, "utf8");
  const noJoin = good.replace(
    /statusApiParam\s*=\s*[\s\S]{0,280}?statusFilter\.join\(["'],["']\)/,
    'statusApiParam = statusFilter.length === 1 ? statusFilter[0] : undefined',
  );
  if (!checkVendorsBatch76(noJoin).some((m) => /statusApiParam must statusFilter\.join/.test(m))) {
    console.error(LABEL, "SELFTEST FAIL — expected FAIL without statusApiParam join", checkVendorsBatch76(noJoin));
    process.exit(1);
  }
  const withClientFilter =
    good.replace(
      /return \(billsQuery\.data\?\.rows \?\? \[\]\)\.filter\(\(bill\) => \{/,
      `return (billsQuery.data?.rows ?? []).filter((bill) => {
      if (statusFilter.length > 1) {
        if (!statusFilter.includes(bill.status)) return false;
      }`,
    );
  if (!checkVendorsBatch76(withClientFilter).some((m) => /client-filter|after LIMIT/.test(m))) {
    console.error(LABEL, "SELFTEST FAIL — expected FAIL when multi-status client-filters");
    process.exit(1);
  }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}

if (fails.length) {
  console.error(LABEL, "FAIL", fails);
  process.exit(1);
}
console.log(LABEL, "PASS — Vendor/Customer txn Status multi-select + vendor server union");
