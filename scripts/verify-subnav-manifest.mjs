#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const subnavPath = path.resolve("apps/frontend/src/pages/accounting/AccountingSubNav.tsx");

function fail(message) {
  console.error(`verify:subnav-manifest FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(subnavPath)) {
  fail("AccountingSubNav.tsx not found");
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
