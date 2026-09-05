#!/usr/bin/env node
/**
 * verify-counterparty-side-search.mjs
 *
 * Verifies the original SIDE SEARCH PANEL is restored on Customers + Vendors
 * list view landing — the sidebar (search input, sort dropdown, paginated list)
 * must be rendered in BOTH view modes (list and master-detail), not just
 * master-detail.
 *
 * Static source check — no DB needed.
 */
import fs from "node:fs";

const CUSTOMERS_PAGE = "apps/frontend/src/pages/Customers.tsx";
const VENDORS_PAGE = "apps/frontend/src/pages/Vendors.tsx";

let failures = 0;

function fail(msg) {
  console.error(`FAIL verify-counterparty-side-search: ${msg}`);
  failures += 1;
}

function checkFile(path, label, checks) {
  if (!fs.existsSync(path)) {
    fail(`${label}: file not found at ${path}`);
    return "";
  }
  const src = fs.readFileSync(path, "utf8");
  for (const check of checks) {
    if (!check.pattern.test(src)) {
      fail(`${label}: ${check.description}`);
    }
  }
  return src;
}

// Customers.tsx — sidebar must appear in BOTH viewMode branches
const customersSrc = checkFile(CUSTOMERS_PAGE, "Customers.tsx", [
  { pattern: /CustomerListSidebar/, description: "CustomerListSidebar import/render not found" },
  { pattern: /viewMode === "list"/, description: "list view branch not found" },
]);

// The list view branch must contain CustomerListSidebar (not just master-detail)
if (customersSrc) {
  // Extract the list view branch (from `viewMode === "list"` to the next `: (` else)
  const listBranchMatch = customersSrc.match(/viewMode === "list"\s*\?([\s\S]*?)\n\s*\)\s*:\s*\(/);
  if (listBranchMatch) {
    const listBranch = listBranchMatch[1];
    if (!/CustomerListSidebar/.test(listBranch)) {
      fail("Customers.tsx: CustomerListSidebar NOT rendered in list view branch (only in master-detail)");
    }
  } else {
    fail("Customers.tsx: could not extract list view branch to verify sidebar presence");
  }
}

// Vendors.tsx — same check
const vendorsSrc = checkFile(VENDORS_PAGE, "Vendors.tsx", [
  { pattern: /VendorListSidebar/, description: "VendorListSidebar import/render not found" },
  { pattern: /viewMode === "list"/, description: "list view branch not found" },
]);

if (vendorsSrc) {
  const listBranchMatch = vendorsSrc.match(/viewMode === "list"\s*\?([\s\S]*?)\n\s*\)\s*:\s*\(/);
  if (listBranchMatch) {
    const listBranch = listBranchMatch[1];
    if (!/VendorListSidebar/.test(listBranch)) {
      fail("Vendors.tsx: VendorListSidebar NOT rendered in list view branch (only in master-detail)");
    }
  } else {
    fail("Vendors.tsx: could not extract list view branch to verify sidebar presence");
  }
}

if (failures > 0) {
  console.error(`\n[verify-counterparty-side-search] FAIL — ${failures} issue(s)`);
  process.exit(1);
}

console.log("[verify-counterparty-side-search] PASS — side search panel restored on Customers + Vendors list view");
process.exit(0);
