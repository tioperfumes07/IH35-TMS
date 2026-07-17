#!/usr/bin/env node
/**
 * verify-banking-qbo-parity-chrome.mjs
 * Guards owner 2026-07-16 Banking QBO chrome: column sort, date presets, Search all,
 * print orientation, View/Inspect tiles, recon flatten/print.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-qbo-parity-chrome";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`MISSING ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const view = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
const tile = read("apps/frontend/src/pages/banking/components/AccountTile.tsx");
const recon = read("apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx");
const matchDrawer = read("apps/frontend/src/pages/banking/components/MatchDrawer.tsx");
const printDlg = read("apps/frontend/src/pages/banking/components/PrintOrientationDialog.tsx");
const pkg = read("package.json");
const tracker = read("docs/trackers/BANK-SORT-ROLLOUT.md");

if (view && /sortable=\{false\}/.test(view)) {
  failures.push("BankingTransactionsDesignView must not leave sortable={false} on register columns");
}
if (view && !/PrintOrientationDialog/.test(view)) {
  failures.push("register must use PrintOrientationDialog");
}
if (view && !/bank-date-filter-button/.test(view)) {
  failures.push("register date filter button must have data-testid bank-date-filter-button");
}
if (tile && !/bank-account-tile-view/.test(tile)) {
  failures.push("AccountTile must expose View action");
}
if (tile && !/bank-account-tile-inspect/.test(tile)) {
  failures.push("AccountTile must expose Inspect action");
}
if (matchDrawer && !/match-search-all/.test(matchDrawer)) {
  failures.push("MatchDrawer must expose Search all control");
}
if (recon && !/PrintOrientationDialog/.test(recon)) {
  failures.push("ReconciliationWorkspace must use PrintOrientationDialog");
}
if (recon && !/toggleTxnSort|txnSort/.test(recon)) {
  failures.push("ReconciliationWorkspace must support column sort");
}
if (!printDlg) failures.push("PrintOrientationDialog.tsx missing");
if (tracker && !/BANK-SORT-ROLLOUT-ACCT/.test(tracker)) {
  failures.push("BANK-SORT-ROLLOUT tracker must name Accounting follow-up block");
}
if (pkg && !/"verify:banking-qbo-parity-chrome"/.test(pkg)) {
  failures.push("package.json must wire verify:banking-qbo-parity-chrome");
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK`);
process.exit(0);
