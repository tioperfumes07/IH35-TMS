#!/usr/bin/env node
/**
 * verify-navy-page-subnav.mjs
 * Locks the approved navy sub-nav banner tokens for DESIGN-STD-NAVY-PAGE-BANNER.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-navy-page-subnav";
let failed = false;

function fail(msg) { console.error(`[${LABEL}] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[${LABEL}] PASS: ${msg}`); }

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing file: ${rel}`); return ""; }
  return fs.readFileSync(abs, "utf8");
}

const COMPONENT = "apps/frontend/src/components/layout/NavyPageSubNav.tsx";
const SETTLEMENTS = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";

const component = read(COMPONENT);
const settlements = read(SETTLEMENTS);

// Locked visual tokens
if (!component.includes("bg-[#1A1F36]")) fail("NavyPageSubNav missing locked token: bg-[#1A1F36]");
else pass("bg-[#1A1F36] present");

if (!component.includes("text-[11px]")) fail("NavyPageSubNav missing locked token: text-[11px]");
else pass("text-[11px] present");

if (!component.includes("text-white")) fail("NavyPageSubNav missing locked token: text-white");
else pass("text-white present");

if (!component.includes("overflow-x-auto")) fail("NavyPageSubNav missing locked token: overflow-x-auto");
else pass("overflow-x-auto present");

if (!component.includes("border-b border-white")) fail("NavyPageSubNav missing locked active class: border-b border-white");
else pass("active class border-b border-white present");

// NavLink usage
if (!component.includes("NavLink")) fail("NavyPageSubNav must use NavLink (not plain <a> or <span>)");
else pass("NavLink used for items");

// aria-label
if (!component.includes('aria-label="Section navigation"')) fail('NavyPageSubNav missing aria-label="Section navigation"');
else pass('aria-label="Section navigation" present');

// SettlementsPage uses the component
if (!settlements.includes("NavyPageSubNav")) fail("SettlementsPage.tsx does not import/use NavyPageSubNav");
else pass("SettlementsPage uses NavyPageSubNav");

// SettlementsPage no longer has the inline hardcoded nav
if (settlements.includes('"Settlements" ? "border-b')) fail("SettlementsPage still has hardcoded inline active check — swap not complete");
else pass("SettlementsPage inline nav replaced");

if (failed) { console.error(`\n[${LABEL}] FAILED`); process.exit(1); }
console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
