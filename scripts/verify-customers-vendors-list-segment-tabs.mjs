#!/usr/bin/env node
/**
 * GUARD: Customers + Vendors list segment tabs must exist (FE-LIST-SEGMENT-TABS-DELETED-B3690EB68).
 * §7 additive-only — b3690eb68 deleted Vendors/Customers tabs; Drivers kept them.
 *
 * Run: node scripts/verify-customers-vendors-list-segment-tabs.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-customers-vendors-list-segment-tabs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// DISP-F9998 -- both pages were migrated from the standalone SecondaryNavTabs component onto the
// shared NavyPageSubNav (apps/frontend/src/components/layout/NavyPageSubNav.tsx) at some point after
// this guard was written; SecondaryNavTabs.tsx still exists and is used elsewhere (Users.tsx,
// VendorDetail.tsx), it just isn't what renders these two list segment-tab rows anymore. Re-anchored
// to the component actually wired here, not to the one that used to be.
function assertVendors(src) {
  const problems = [];
  if (!/by-category/.test(src)) problems.push("Vendors.tsx missing by-category list segment");
  if (!/By Category/.test(src)) problems.push("Vendors.tsx missing By Category tab label");
  if (!/NavyPageSubNav/.test(src)) problems.push("Vendors.tsx missing NavyPageSubNav");
  if (!/VENDOR_LIST_TAB_IDS/.test(src)) problems.push("Vendors.tsx missing VENDOR_LIST_TAB_IDS");
  return problems;
}

function assertCustomers(src) {
  const problems = [];
  // Customers restore may already be present — require NavyPageSubNav + at least Preferred/Watch/Inactive
  if (!/NavyPageSubNav/.test(src)) problems.push("Customers.tsx missing NavyPageSubNav");
  const need = [/Preferred/i, /Watch/i, /Inactive/i];
  for (const re of need) {
    if (!re.test(src)) problems.push(`Customers.tsx missing segment label matching ${re}`);
  }
  return problems;
}

function selftest() {
  const goodV = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/Vendors.tsx"), "utf8");
  const goodC = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/Customers.tsx"), "utf8");
  const badV = goodV.replace(/by-category/g, "x").replace(/By Category/g, "X");
  let failed = 0;
  if (assertVendors(goodV).length !== 0) {
    console.error("good vendors should pass", assertVendors(goodV));
    failed++;
  }
  if (assertVendors(badV).length < 1) {
    console.error("bad vendors should fail");
    failed++;
  }
  if (assertCustomers(goodC).length !== 0) {
    console.error("good customers should pass", assertCustomers(goodC));
    failed++;
  }
  if (failed) {
    console.error(`${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = [
  ...assertVendors(fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/Vendors.tsx"), "utf8")),
  ...assertCustomers(fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/Customers.tsx"), "utf8")),
];
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Customers + Vendors list segment tabs present`);
