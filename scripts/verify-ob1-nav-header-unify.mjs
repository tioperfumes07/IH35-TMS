#!/usr/bin/env node
/**
 * verify-ob1-nav-header-unify.mjs
 * Assert OB1-NAV-HEADER-UNIFY deliverables.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`[verify-ob1] FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}
let failed = false;
function fail(msg) { console.error(`[verify-ob1] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-ob1] PASS: ${msg}`); }

const manifest = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
const subNav = read("apps/frontend/src/pages/accounting/AccountingSubNav.tsx");
const wrapper = read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx");

// ACCOUNTING_CLEAN_TABS exported from manifest
if (!manifest.includes("export const ACCOUNTING_CLEAN_TABS")) fail("subnav-manifest missing ACCOUNTING_CLEAN_TABS export");
else pass("ACCOUNTING_CLEAN_TABS exported from subnav-manifest");

// AccountingSubNav uses ACCOUNTING_CLEAN_TABS (not HoverDropdownNav)
if (subNav.includes("HoverDropdownNav")) fail("AccountingSubNav still imports legacy HoverDropdownNav");
else pass("AccountingSubNav no longer uses HoverDropdownNav");

if (!subNav.includes("ACCOUNTING_CLEAN_TABS")) fail("AccountingSubNav does not use ACCOUNTING_CLEAN_TABS");
else pass("AccountingSubNav uses ACCOUNTING_CLEAN_TABS");

// AccountingSubNav has unified test id
if (!subNav.includes("accounting-subnav-unified")) fail("AccountingSubNav missing data-testid accounting-subnav-unified");
else pass("AccountingSubNav has data-testid accounting-subnav-unified");

// AccountingSubNavWrapper no longer defines its own ACCOUNTING_TABS constant
if (wrapper.includes("const ACCOUNTING_TABS")) fail("AccountingSubNavWrapper still defines local ACCOUNTING_TABS (should import from manifest)");
else pass("AccountingSubNavWrapper imports ACCOUNTING_CLEAN_TABS from manifest (no local copy)");

// Factoring tab present in clean tabs
if (!manifest.includes('"Factoring"') || !manifest.includes('"/accounting/factoring"')) fail("ACCOUNTING_CLEAN_TABS missing Factoring tab");
else pass("ACCOUNTING_CLEAN_TABS includes Factoring tab pointing to /accounting/factoring");

// Settlements tab present in clean tabs
if (!manifest.includes('"Settlements"') || !manifest.includes('"/driver-finance/settlements"')) fail("ACCOUNTING_CLEAN_TABS missing Settlements tab");
else pass("ACCOUNTING_CLEAN_TABS includes Settlements tab");

// Verify 12 tabs total
const tabCount = (manifest.match(/\{ label:/g) || []).length;
if (tabCount < 12) fail(`ACCOUNTING_CLEAN_TABS has fewer than 12 tabs (found ~${tabCount})`);
else pass(`ACCOUNTING_CLEAN_TABS has ${tabCount} tab entries`);

if (failed) { console.error("\n[verify-ob1] FAILED"); process.exit(1); }
console.log("\n[verify-ob1] ALL CHECKS PASSED");
