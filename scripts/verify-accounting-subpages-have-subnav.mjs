#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const WRAPPER_FILE = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";
// Grouped click-open redesign (3-Accounting-Dropdown.png): wrapper renders ACCOUNTING_SUB_NAV_ITEMS via
// the shared HoverDropdownNav, keeping the + Create action, honest vendor navigation, and wrapper data-attr.
// ACCT-F5697 (#13541) intentionally replaced the misleading "+ Vendor" label: this link navigates to
// the vendor roster and does not open a creator, so the product-wide create-label law requires browse copy.
const REQUIRED_WRAPPER_MARKERS = ["ACCOUNTING_SUB_NAV_ITEMS", "HoverDropdownNav", "+ Create", "Go to vendors", "data-accounting-subnav-wrapper"];

const REQUIRED_PAGES = ["apps/frontend/src/pages/accounting/BillsPage.tsx"];

function audit(sources) {
  const failures = [];
  const wrapperSource = sources.wrapper;
  if (wrapperSource == null) {
    failures.push(`${WRAPPER_FILE} (missing)`);
  } else {
  for (const marker of REQUIRED_WRAPPER_MARKERS) {
    if (!wrapperSource.includes(marker)) failures.push(`${WRAPPER_FILE} (missing marker: ${marker})`);
  }
  const tabCount = (sources.manifest.match(/label:/g) ?? []).length;
  if (tabCount < 12) failures.push(`subnav-manifest.ts (expected >=12 tab labels in ACCOUNTING_CLEAN_TABS, found ${tabCount})`);
  }

  for (const pageFile of REQUIRED_PAGES) {
    const source = sources.pages[pageFile];
    if (source == null) {
    failures.push(`${pageFile} (missing)`);
    continue;
    }
    if (!source.includes("AccountingSubNavWrapper")) {
      failures.push(`${pageFile} (must import AccountingSubNavWrapper)`);
    }
  }
  return failures;
}

const readMaybe = (rel) => {
  const full = path.join(repoRoot, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
};
const sources = {
  wrapper: readMaybe(WRAPPER_FILE),
  manifest: readMaybe("apps/frontend/src/pages/accounting/subnav-manifest.ts") ?? "",
  pages: Object.fromEntries(REQUIRED_PAGES.map((file) => [file, readMaybe(file)])),
};
const failures = audit(sources);
if (failures.length > 0) {
  console.error("[verify-accounting-subpages-have-subnav] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = REQUIRED_WRAPPER_MARKERS.map((marker, index) => ({
    name: `wrapper marker ${marker}`,
    value: { ...sources, wrapper: sources.wrapper?.replaceAll(marker, `BROKEN_MARKER_${index}`) ?? null },
  }));
  mutations.push({
    name: "manifest depth",
    value: { ...sources, manifest: sources.manifest.replaceAll("label:", "removedLabel:") },
  });
  const bills = REQUIRED_PAGES[0];
  mutations.push({
    name: "Bills wrapper mount",
    value: { ...sources, pages: { ...sources.pages, [bills]: sources.pages[bills]?.replaceAll("AccountingSubNavWrapper", "RemovedSubNavWrapper") ?? null } },
  });
  for (const mutation of mutations) {
    if (audit(mutation.value).length === 0) {
      console.error(`[verify-accounting-subpages-have-subnav] SELFTEST FAIL — ${mutation.name} escaped`);
      process.exit(1);
    }
  }
  console.log(`[verify-accounting-subpages-have-subnav] SELFTEST PASS — ${mutations.length}/${mutations.length} mutations rejected`);
}

console.log("[verify-accounting-subpages-have-subnav] OK — BillsPage wrapped with 12-tab accounting subnav");
