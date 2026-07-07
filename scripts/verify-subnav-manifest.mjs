#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const subnavPath = path.resolve("apps/frontend/src/pages/accounting/AccountingSubNav.tsx");

function fail(message) {
  console.error(`verify:subnav-manifest FAIL: ${message}`);
  process.exit(1);
}

// orphan-triage F1: AccountingSubNav.tsx was the legacy left-rail-era component this guard
// existed to keep in sync with subnav-manifest.ts (no competing inline item literal). It was a
// verified-dead, zero-consumer duplicate of the live AccountingSubNavWrapper.tsx and has been
// deleted (verify-accounting-nav.mjs Check 4 CI-enforces that no OTHER page may import it back).
// With the file gone there is no inline literal left to drift out of sync — pass.
if (!fs.existsSync(subnavPath)) {
  console.log("verify:subnav-manifest OK (AccountingSubNav.tsx retired — nothing to check)");
  process.exit(0);
}

const source = fs.readFileSync(subnavPath, "utf8");

if (source.includes("export const ACCOUNTING_SUB_NAV_ITEMS = [")) {
  fail("AccountingSubNav.tsx still contains inline subnav literal");
}

if (!source.includes('from "./subnav-manifest"')) {
  fail("AccountingSubNav.tsx must import from subnav-manifest");
}

if (!source.includes("ACCOUNTING_SUB_NAV_ITEMS.map")) {
  fail("AccountingSubNav.tsx must map manifest items at render");
}

console.log("verify:subnav-manifest OK");
