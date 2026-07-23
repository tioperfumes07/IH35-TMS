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

function assertApUsesAccount(rel) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const apIdx = src.indexOf("A/P Account");
  if (apIdx < 0) {
    // CreateMultipleBills uses "A/P account"
    const alt = src.indexOf("A/P account");
    if (alt < 0) fail(`${rel}: A/P Account label not found`);
  }
  // Within ~800 chars after A/P label, require createKind="account"
  const start = Math.max(src.lastIndexOf(">A/P account<"), src.lastIndexOf("A/P Account"), src.indexOf("A/P account"));
  // Prefer the table header label (column), not the error banner text "A/P accounts".
  const header = src.indexOf(">A/P account</th>");
  const anchor = header >= 0 ? header : start;
  const window = src.slice(anchor, anchor + 2500);
  if (!window.includes('createKind="account"')) {
    fail(`${rel}: A/P picker must use createKind="account"`);
  }
  if (window.includes('createKind="category"')) {
    // Ignore mentions inside comments that document the forbidden pattern.
    const withoutComments = window.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (withoutComments.includes('createKind="category"')) {
      fail(`${rel}: A/P picker must NOT use createKind="category"`);
    }
  }
  console.log(`OK: ${rel}`);
}

assertApUsesAccount("apps/frontend/src/components/accounting/VendorBillForm.tsx");
assertApUsesAccount("apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx");
assertApUsesAccount("apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx");
console.log("PASS: verify-acct-ap-createkind-account");
