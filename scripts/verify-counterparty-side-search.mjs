#!/usr/bin/env node
/**
 * verify-counterparty-side-search.mjs
 *
 * Verifies the side search panel contract on Customers + Vendors. ROUND 18.1
 * Item D (owner-directed, 2026-09-12) reversed the original "sidebar in both
 * modes" ruling: mounting the master-detail rolodex sidebar inside List view
 * rendered the same 1,218-row roster twice, unsynchronized, beside
 * CustomersListView's ParityTable. The sidebar belongs to Master-detail only;
 * List view mounts the full roster component instead.
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
    if (!/CustomersListView/.test(listBranch)) {
      fail("Customers.tsx: list view branch must mount CustomersListView (the full ParityTable roster)");
    }
    if (/CustomerListSidebar/.test(listBranch)) {
      fail("Customers.tsx: CustomerListSidebar must NOT mount inside list view — ROUND 18.1 removed the duplicate unsynchronized roster");
    }
  } else {
    fail("Customers.tsx: could not extract list view branch to verify roster presence");
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
    if (!/VendorsListView/.test(listBranch)) {
      fail("Vendors.tsx: list view branch must mount VendorsListView (the full ParityTable roster)");
    }
    if (/VendorListSidebar/.test(listBranch)) {
      fail("Vendors.tsx: VendorListSidebar must NOT mount inside list view — ROUND 18.1 removed the duplicate unsynchronized roster");
    }
  } else {
    fail("Vendors.tsx: could not extract list view branch to verify roster presence");
  }
}

if (failures > 0) {
  console.error(`\n[verify-counterparty-side-search] FAIL — ${failures} issue(s)`);
  process.exit(1);
}

console.log("[verify-counterparty-side-search] PASS — list view mounts the roster; sidebars stay master-detail only");
process.exit(0);
