#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const WRAPPER_FILE = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";
const REQUIRED_WRAPPER_MARKERS = ["ACCOUNTING_CLEAN_TABS", "+ Create", "+ Vendor", "data-accounting-subnav-wrapper"];

const REQUIRED_PAGES = ["apps/frontend/src/pages/accounting/BillsPage.tsx"];

const failures = [];

const wrapperPath = path.join(repoRoot, WRAPPER_FILE);
if (!fs.existsSync(wrapperPath)) {
  failures.push(`${WRAPPER_FILE} (missing)`);
} else {
  const wrapperSource = fs.readFileSync(wrapperPath, "utf8");
  for (const marker of REQUIRED_WRAPPER_MARKERS) {
    if (!wrapperSource.includes(marker)) failures.push(`${WRAPPER_FILE} (missing marker: ${marker})`);
  }
  const manifestPath = path.join(repoRoot, "apps/frontend/src/pages/accounting/subnav-manifest.ts");
  const manifestSource = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  const tabCount = (manifestSource.match(/label:/g) ?? []).length;
  if (tabCount < 12) failures.push(`subnav-manifest.ts (expected >=12 tab labels in ACCOUNTING_CLEAN_TABS, found ${tabCount})`);
}

for (const pageFile of REQUIRED_PAGES) {
  const full = path.join(repoRoot, pageFile);
  if (!fs.existsSync(full)) {
    failures.push(`${pageFile} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  if (!source.includes("AccountingSubNavWrapper")) {
    failures.push(`${pageFile} (must import AccountingSubNavWrapper)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-accounting-subpages-have-subnav] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-accounting-subpages-have-subnav] OK — BillsPage wrapped with 12-tab accounting subnav");
