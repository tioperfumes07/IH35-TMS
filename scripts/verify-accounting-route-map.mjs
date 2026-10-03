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
    // U13 (owner, 2026-10-03): Vendors and Customers are their own sidebar modules, not Accounting tabs — they left the
    // Accounting bar; the /accounting/* paths stay as redirects for old links.
    { from: "/accounting/vendors", to: "/vendors", targetPage: "VendorsPage", inSubnav: false },
    { from: "/accounting/customers", to: "/customers", targetPage: "CustomersPage", inSubnav: false },
    { from: "/accounting/reports", to: "/reports", targetPage: "ReportsHomePage", inSubnav: true },
  ];

  for (const { from, to, targetPage, inSubnav } of parityMap) {
    const navRe = new RegExp(`(?:href|path):\\s*"${escapeRegex(from)}"`);
    if (inSubnav) {
      assertMatches(accountingSubNav, navRe, `Accounting sub-nav item missing for ${from}`);
    } else if (navRe.test(accountingSubNav)) {
      throw new Error(`${from} is back on the Accounting bar — U13 moved it to its own module`);
    }

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
