#!/usr/bin/env node
/** Guard: A/P Account pickers use createKind="account", not category (Accounting 8/M). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

// Anchor on the A/P picker's own placeholder and inspect ONLY the JSX element that owns it.
// (The old heuristic scanned a fixed 2500-char window after the column header; adding a legitimate
// neighbouring column — e.g. the separate Expense-account picker — pushed the A/P ReferenceSelect
// out of that window and made the guard fail on correct code. Element-scoped is strictly tighter:
// it can no longer be satisfied by some *other* picker's createKind that happens to be nearby.)
const AP_PLACEHOLDER = /placeholder="[^"]*A\/P account[^"]*"/gi;

function assertApUsesAccount(rel) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  if (!src.includes("A/P Account") && !src.includes("A/P account")) {
    fail(`${rel}: A/P Account label not found`);
  }

  const matches = [...src.matchAll(AP_PLACEHOLDER)];
  if (matches.length === 0) fail(`${rel}: no A/P account picker placeholder found`);

  for (const m of matches) {
    const open = src.lastIndexOf("<ReferenceSelect", m.index);
    if (open < 0) fail(`${rel}: A/P account placeholder is not inside a <ReferenceSelect`);
    const close = src.indexOf("/>", m.index);
    if (close < 0) fail(`${rel}: could not find end of the A/P <ReferenceSelect element`);
    const element = src.slice(open, close + 2);
    if (!element.includes('createKind="account"')) {
      fail(`${rel}: A/P picker must use createKind="account"`);
    }
    // Ignore mentions inside comments that document the forbidden pattern.
    const withoutComments = element.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (withoutComments.includes('createKind="category"')) {
      fail(`${rel}: A/P picker must NOT use createKind="category"`);
    }
  }
  console.log(`OK: ${rel} (${matches.length} A/P picker(s))`);
}

assertApUsesAccount("apps/frontend/src/components/accounting/VendorBillForm.tsx");
assertApUsesAccount("apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx");
assertApUsesAccount("apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx");
console.log("PASS: verify-acct-ap-createkind-account");
