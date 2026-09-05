#!/usr/bin/env node
/**
 * GUARD — counterparty (Customers / Vendors) landing list views must carry roll-up
 * columns and follow the dash-never-zero display pattern.
 *
 * WHAT IT ASSERTS:
 *  1. CustomersListView has columns labelled "Loads", "Booked YTD", and "Last Load".
 *  2. VendorsListView has columns labelled "Purchases YTD" and "Last Purchase"
 *     wired to live vendor roll-up data (formatUsdCents + mmmDd, not "—" placeholders).
 *  3. No cell renderer visibly outputs the literal text "None", "null", or "undefined".
 *  4. Money columns use formatUsdCents (via fmtMoney) — never a raw number cast.
 *  5. Date columns use mmmDd (or a dash fallback) — never toLocaleDateString.
 *
 * Exits 0 if all checks pass, 1 otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-counterparty-landing-polish";

const CUSTOMERS_PATH = path.join(ROOT, "apps/frontend/src/pages/customers/CustomersListView.tsx");
const VENDORS_PATH = path.join(ROOT, "apps/frontend/src/pages/vendors/VendorsListView.tsx");

const errors = [];

function checkFile(label, filePath, checks) {
  if (!fs.existsSync(filePath)) {
    errors.push(`[${label}] file not found: ${path.relative(ROOT, filePath)}`);
    return;
  }
  const src = fs.readFileSync(filePath, "utf8");
  for (const check of checks) {
    const result = check(src, filePath);
    if (result) errors.push(`[${label}] ${result}`);
  }
}

// --- Customer list checks ---
checkFile("customers", CUSTOMERS_PATH, [
  // 1a. Loads column
  (src) => {
    const hasLabel = /label:\s*["']Loads["']/.test(src);
    return hasLabel ? null : 'missing "Loads" column (label: "Loads")';
  },
  // 1b. Booked YTD column
  (src) => {
    const hasLabel = /label:\s*["']Booked YTD["']/.test(src);
    return hasLabel ? null : 'missing "Booked YTD" column (label: "Booked YTD")';
  },
  // 1c. Last Load column
  (src) => {
    const hasLabel = /label:\s*["']Last Load["']/.test(src);
    return hasLabel ? null : 'missing "Last Load" column (label: "Last Load")';
  },
  // 3. No visible "None" / "null" / "undefined" text in render functions
  (src) => {
    // Look for string literals inside render: arrows that output these words as visible text.
    // Exclude comments (// ... and /* ... */) and import/type lines.
    const lines = src.split("\n");
    const bad = [];
    lines.forEach((line, _i) => {
      const trimmed = line.trim();
      // Skip comment-only lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      // Skip import / type / interface lines
      if (/^(import|export\s+type|type\s|interface\s)/.test(trimmed)) return;
      // Flag a string literal that is exactly "None", "null", or "undefined" as rendered text
      // (e.g. return "None", or `"None"` inside JSX text). We look for quoted occurrences that
      // are NOT part of a comparison (== null / != null) or a type annotation.
      if (/["'`](None|undefined)["'`]/.test(line) && !/==|!=|typeof|instanceof/.test(line)) {
        bad.push(`line ${_i + 1}: possible visible "${RegExp.$1}" text — ${trimmed.slice(0, 80)}`);
      }
      // "null" as a visible string literal (not a value keyword)
      if (/["'`]null["'`]/.test(line) && !/==|!=|typeof|instanceof|as\s+null|\|\s+null/.test(line)) {
        bad.push(`line ${_i + 1}: possible visible "null" text — ${trimmed.slice(0, 80)}`);
      }
    });
    return bad.length ? bad.join("; ") : null;
  },
  // 4. Money columns use formatUsdCents / fmtMoney
  (src) => {
    // The file must import formatUsdCents and use fmtMoney for money rendering.
    const hasImport = /formatUsdCents/.test(src);
    const hasFmtMoney = /fmtMoney\s*\(/.test(src);
    return hasImport && hasFmtMoney ? null : "money columns must use formatUsdCents / fmtMoney";
  },
  // 5. Date columns use mmmDd (not toLocaleDateString)
  (src) => {
    // Flag any toLocaleDateString usage in render — should use mmmDd instead.
    if (/toLocaleDateString/.test(src)) {
      return "date columns must use mmmDd, not toLocaleDateString";
    }
    const hasMmmDd = /mmmDd/.test(src);
    return hasMmmDd ? null : "date columns must import and use mmmDd";
  },
]);

// --- Vendor list checks ---
checkFile("vendors", VENDORS_PATH, [
  // 2a. Purchases YTD column
  (src) => {
    const hasLabel = /label:\s*["']Purchases YTD["']/.test(src);
    return hasLabel ? null : 'missing "Purchases YTD" column (label: "Purchases YTD")';
  },
  // 2b. Last Purchase column
  (src) => {
    const hasLabel = /label:\s*["']Last Purchase["']/.test(src);
    return hasLabel ? null : 'missing "Last Purchase" column (label: "Last Purchase")';
  },
  // 2c. Vendor roll-up data wired (not "—" placeholders)
  (src) => {
    // The file must reference rollup data (rollupByVendorId or rollup prop)
    const hasRollup = /rollupByVendorId|rollup\??\.purchases_ytd_cents|rollup\??\.last_purchase_date/i.test(src);
    return hasRollup ? null : 'missing vendor roll-up data wiring (rollupByVendorId or rollup prop)';
  },
  // 3. No visible "None" / "null" / "undefined" text in render functions
  (src) => {
    const lines = src.split("\n");
    const bad = [];
    lines.forEach((line, _i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (/^(import|export\s+type|type\s|interface\s)/.test(trimmed)) return;
      if (/["'`](None|undefined)["'`]/.test(line) && !/==|!=|typeof|instanceof/.test(line)) {
        bad.push(`line ${_i + 1}: possible visible "${RegExp.$1}" text — ${trimmed.slice(0, 80)}`);
      }
      if (/["'`]null["'`]/.test(line) && !/==|!=|typeof|instanceof|as\s+null|\|\s+null/.test(line)) {
        bad.push(`line ${_i + 1}: possible visible "null" text — ${trimmed.slice(0, 80)}`);
      }
    });
    return bad.length ? bad.join("; ") : null;
  },
  // 4. Money columns use formatUsdCents / fmtMoney
  (src) => {
    const hasImport = /formatUsdCents/.test(src);
    const hasFmtMoney = /fmtMoney\s*\(/.test(src);
    return hasImport && hasFmtMoney ? null : "money columns must use formatUsdCents / fmtMoney";
  },
  // 5. Date columns use mmmDd (not toLocaleDateString)
  (src) => {
    if (/toLocaleDateString/.test(src)) {
      return "date columns must use mmmDd, not toLocaleDateString";
    }
    const hasMmmDd = /mmmDd/.test(src);
    return hasMmmDd ? null : "date columns must import and use mmmDd";
  },
]);

if (errors.length > 0) {
  console.error(`[${LABEL}] FAIL — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.error(`[${LABEL}] PASS — counterparty landing polish invariants hold.`);
process.exit(0);
