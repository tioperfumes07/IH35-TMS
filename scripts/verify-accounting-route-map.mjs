#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) throw new Error(message);
}

try {
  const appSource = `${read("apps/frontend/src/App.tsx")}\n${
    fs.existsSync("apps/frontend/src/routes/manifest.tsx") ? read("apps/frontend/src/routes/manifest.tsx") : ""
  }`;
  // orphan-triage F1: AccountingSubNav.tsx (a verified-dead, zero-consumer duplicate of the live
  // AccountingSubNavWrapper.tsx — see verify-accounting-nav.mjs Check 4) was deleted. It only ever
  // re-exported subnav-manifest.ts's SUBNAV_ITEMS (which is what the `path:` regex below matches
  // against), so read the manifest directly — same source of truth, no coverage lost.
  const accountingSubNav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");

  const parityMap = [
    { from: "/accounting/vendors", to: "/vendors", targetPage: "VendorsPage" },
    { from: "/accounting/customers", to: "/customers", targetPage: "CustomersPage" },
    { from: "/accounting/reports", to: "/reports", targetPage: "ReportsHomePage" },
    { from: "/accounting/maintenance-shop", to: "/maintenance", targetPage: "MaintenanceHomePage" },
  ];

  for (const { from, to, targetPage } of parityMap) {
    assertMatches(
      accountingSubNav,
      new RegExp(`(?:href|path):\\s*"${escapeRegex(from)}"`),
      `Accounting sub-nav item missing for ${from}`,
    );

    assertMatches(
      appSource,
      new RegExp(
        `<Route\\s+path="${escapeRegex(from)}"[\\s\\S]*?<ProtectedRoute>[\\s\\S]*?<Navigate to="${escapeRegex(to)}" replace \\/>[\\s\\S]*?<\\/ProtectedRoute>[\\s\\S]*?\\/>`,
      ),
      `${from} must be a canonical redirect to ${to} (not missing, fallback, or placeholder)`,
    );

    assertMatches(
      appSource,
      new RegExp(
        `<Route\\s+path="${escapeRegex(to)}"[\\s\\S]*?<ProtectedRoute>[\\s\\S]*?<${targetPage}\\s*\\/>[\\s\\S]*?<\\/ProtectedRoute>[\\s\\S]*?\\/>`,
      ),
      `Canonical target ${to} must resolve to ${targetPage}`,
    );
  }

  console.log("✅ Accounting route map guard passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
