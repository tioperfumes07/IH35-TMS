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

// ACCOUNTING_CLEAN_TABS exported from manifest (OB1 deliverable)
if (!manifest.includes("export const ACCOUNTING_CLEAN_TABS")) fail("subnav-manifest missing ACCOUNTING_CLEAN_TABS export");
else pass("ACCOUNTING_CLEAN_TABS exported from subnav-manifest");

// AccountingSubNav MUST keep HoverDropdownNav (required by CLOSURE-15-DEEP-AUDIT-B locked guard)
if (!subNav.includes("HoverDropdownNav")) fail("AccountingSubNav must keep HoverDropdownNav (CLOSURE-15 locked guard)");
else pass("AccountingSubNav correctly keeps HoverDropdownNav (17-tab invoice-context nav)");

// AccountingSubNav must keep accountingSubNavActiveHref (required by CLOSURE-15)
if (!subNav.includes('pathname.startsWith("/accounting/invoices/")')) fail("accountingSubNavActiveHref missing invoices/ prefix match (CLOSURE-15)");
else pass("accountingSubNavActiveHref intact with invoices/ prefix match");

// AccountingSubNavWrapper uses ACCOUNTING_CLEAN_TABS from manifest (not a local duplicate)
if (wrapper.includes("const ACCOUNTING_TABS")) fail("AccountingSubNavWrapper still defines local ACCOUNTING_TABS (should import from manifest)");
else pass("AccountingSubNavWrapper: no local ACCOUNTING_TABS duplicate");

if (!wrapper.includes("ACCOUNTING_CLEAN_TABS")) fail("AccountingSubNavWrapper does not use ACCOUNTING_CLEAN_TABS from manifest");
else pass("AccountingSubNavWrapper uses ACCOUNTING_CLEAN_TABS from manifest");

// Factoring tab present in clean tabs
if (!manifest.includes('"Factoring"') || !manifest.includes('"/accounting/factoring"')) fail("ACCOUNTING_CLEAN_TABS missing Factoring tab");
else pass("ACCOUNTING_CLEAN_TABS includes Factoring → /accounting/factoring");

// Settlements tab present in clean tabs
if (!manifest.includes('"Settlements"') || !manifest.includes('"/driver-finance/settlements"')) fail("ACCOUNTING_CLEAN_TABS missing Settlements tab");
else pass("ACCOUNTING_CLEAN_TABS includes Settlements → /driver-finance/settlements");

// Verify ACCOUNTING_CLEAN_TABS block has >=12 entries
const cleanTabsBlock = manifest.match(/export const ACCOUNTING_CLEAN_TABS\s*=\s*\[([\s\S]*?)\]\s*as const/);
const tabCount = cleanTabsBlock ? (cleanTabsBlock[1].match(/label:/g) ?? []).length : 0;
if (tabCount < 12) fail(`ACCOUNTING_CLEAN_TABS has fewer than 12 entries (found ${tabCount})`);
else pass(`ACCOUNTING_CLEAN_TABS has ${tabCount} tab entries`);

if (failed) { console.error("\n[verify-ob1] FAILED"); process.exit(1); }
console.log("\n[verify-ob1] ALL CHECKS PASSED");
