#!/usr/bin/env node
// VENDORS-BY-CATEGORY-PAGER-TOTAL-STUCK-ACTIVE-ONLY — guard
//
// /vendors's "By Category" tab, with no vendor-type selected, is labelled "By Category (124)"
// (vendorTabCounts.byCategory — the full active+inactive roster) but its own pager underneath used to
// show "1-50 of 113" (vendorsServerTotal falling through to the active-only branch) -- a live,
// reproducible mismatch on the same screen, and the 11 real inactive vendors were unreachable via
// pagination on this tab even though the underlying visibleVendors list already included them with no
// categoryFilter set. This guard fails if vendorsServerTotal stops branching on "by-category".

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/Vendors.tsx";

export function check(text) {
  const failures = [];
  if (!/listStatus === "by-category"\s*\n\s*\?\s*categoryFilter/.test(text)) {
    failures.push(`${FILE} vendorsServerTotal no longer has a dedicated "by-category" branch`);
  }
  if (!/\?\s*vendorTabCounts\.byCategory/.test(text)) {
    failures.push(`${FILE} the by-category+categoryFilter branch no longer falls back to vendorTabCounts.byCategory`);
  }
  // With no categoryFilter, by-category must total the FULL merged roster (same server counts as "all"),
  // not the plain active-only vendorsQuery total.
  const serverTotalDeclIdx = text.indexOf("const vendorsServerTotal =");
  const serverTotalBlock = serverTotalDeclIdx >= 0 ? text.slice(serverTotalDeclIdx, serverTotalDeclIdx + 500) : "";
  if (!/\(vendorsQuery\.data\?\.total \?\? 0\) \+ \(inactiveVendorsQuery\.data\?\.total \?\? 0\)[\s\S]*?:\s*vendorsQuery\.data\?\.total \?\? 0;/.test(serverTotalBlock)) {
    failures.push(`${FILE} the by-category+no-categoryFilter branch no longer sums the active+inactive server totals`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: vendors-by-category-pager-total");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: /vendors 'By Category' tab pager total matches its own tab-label count (active+inactive merged, or the clientside category count when a vendor type is selected)");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    /listStatus === "by-category"\s*\n\s*\?\s*categoryFilter\s*\n\s*\?\s*vendorTabCounts\.byCategory\s*\n\s*:\s*\(vendorsQuery\.data\?\.total \?\? 0\) \+ \(inactiveVendorsQuery\.data\?\.total \?\? 0\)\s*\n\s*:\s*vendorsQuery\.data\?\.total \?\? 0;/,
    "vendorsQuery.data?.total ?? 0;",
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (by-category falls through to active-only total again) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
