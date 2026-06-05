#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    file: "apps/frontend/src/components/shared/CardLink.tsx",
    markers: ["export function CardLink", "<Link", "to={href}"],
  },
  {
    file: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx",
    markers: ["CardLink", "href={`/customers/${", "data-customer-list-sidebar", "SidebarPagination"],
  },
  {
    file: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx",
    markers: ["CardLink", "href={`/vendors/${", "data-vendor-list-sidebar", "SidebarPagination"],
  },
];

const failures = [];

for (const req of REQUIRED) {
  const full = path.join(repoRoot, req.file);
  if (!fs.existsSync(full)) {
    failures.push(`${req.file} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  if (source.includes("<button") && source.includes("onClick={() => onSelectCustomer")) {
    failures.push(`${req.file} (customer cards must use CardLink anchors, not button click handlers)`);
  }
  if (source.includes("<button") && source.includes("onClick={() => onSelectVendor")) {
    failures.push(`${req.file} (vendor cards must use CardLink anchors, not button click handlers)`);
  }
  for (const marker of req.markers) {
    if (!source.includes(marker)) failures.push(`${req.file} (missing marker: ${marker})`);
  }
}

if (failures.length > 0) {
  console.error("[verify-list-cards-are-anchors] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-list-cards-are-anchors] OK — customer/vendor sidebar cards use anchor hrefs");
