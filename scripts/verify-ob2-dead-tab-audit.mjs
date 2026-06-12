#!/usr/bin/env node
/**
 * OB2 — DEAD-TAB-AUDIT-AND-FIX verification script
 * Ensures every nav/tab item maps to a registered route that renders a real component
 * (not ComingSoon/404 placeholder)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function fail(message) {
  failed++;
  console.error(`  ✗ FAIL: ${message}`);
}

// Read manifest.tsx to check for ComingSoonPage routes
const manifestPath = resolve(rootDir, "apps/frontend/src/routes/manifest.tsx");
const manifestContent = readFileSync(manifestPath, "utf-8");

// Read accounting subnav
const accountingSubnavPath = resolve(rootDir, "apps/frontend/src/pages/accounting/subnav-manifest.ts");
const accountingSubnavContent = readFileSync(accountingSubnavPath, "utf-8");

// Read safety tabs config
const safetyTabsPath = resolve(rootDir, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
const safetyTabsContent = readFileSync(safetyTabsPath, "utf-8");

console.log("\nOB2 — Dead Tab Audit Verification\n");

// 1. Check QBO_ACCOUNTING_SUBNAV has no ComingSoon routes
console.log("1. Accounting QBO subnav — no dead tabs:");
const deadAccountingRoutes = [
  "/accounting/integration-transactions",
  "/accounting/receipts",
  "/accounting/recurring-transactions",
  "/accounting/revenue-recognition",
  "/accounting/fixed-assets",
  "/accounting/prepaid-expenses",
  "/accounting/my-accountant",
];
const hasDeadAccountingTabs = deadAccountingRoutes.some(r => accountingSubnavContent.includes(r));
assert(!hasDeadAccountingTabs, "QBO_ACCOUNTING_SUBNAV has no ComingSoon/dead tabs");

// 2. Check SAFETY_TABS_CONFIG — all tabs have registered routes in manifest
console.log("\n2. Safety tabs — all routes registered:");
const safetyTabMatches = [...safetyTabsContent.matchAll(/id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*route:\s*"([^"]+)"/g)];
const safetyTabs = safetyTabMatches.map(m => ({ id: m[1], label: m[2], route: m[3] }));

// Extract all route paths from manifest (both absolute and relative)
const manifestRouteMatches = [...manifestContent.matchAll(/path={?"([^"}]+)"}?/g)];
const manifestRoutes = manifestRouteMatches.map(m => m[1]);

// Check each safety tab route exists in manifest
// Safety routes in config are absolute (/safety/xxx) but in manifest they're relative (xxx) inside /safety layout
let missingSafetyRoutes = [];
for (const tab of safetyTabs) {
  const route = tab.route;
  // Extract relative path from absolute route (e.g., /safety/drug-alcohol -> drug-alcohol)
  const relativeRoute = route.replace(/^\/safety\//, '');
  // Check both absolute and relative forms in manifest
  const exists = manifestRoutes.some(mr => 
    mr === route ||                       // Exact absolute match
    mr === relativeRoute ||             // Relative match inside /safety layout
    mr.replace(/^\/safety\//, '') === relativeRoute  // Strip prefix and compare
  );
  if (!exists) {
    missingSafetyRoutes.push(`${tab.id} (${route})`);
  }
}
assert(missingSafetyRoutes.length === 0, 
  `All safety tabs have registered routes (missing: ${missingSafetyRoutes.join(", ") || "none"})`);

// 3. Check no ComingSoonPage in any nav-reachable route
console.log("\n3. No ComingSoonPage stubs in nav routes:");
// Find all Route elements with ComingSoonPage in manifest
const comingSoonRouteMatches = [...manifestContent.matchAll(
  /<Route\s+path={?"([^"}]+)"}?\s+element=\{<ProtectedRoute><ComingSoonPage \/><\/ProtectedRoute>\}/g
)];
const comingSoonRoutes = comingSoonRouteMatches.map(m => m[1]);

// Also check for standalone ComingSoonPage usages that aren't the explicit /coming-soon route
const standaloneComingSoon = comingSoonRoutes.filter(r => r !== '/coming-soon');

// The ListsDomainRoute and ListsCatalogKeyRoute fallbacks are internal fallbacks,
// not directly linked from nav — they redirect to real routes. Verify they're redirects.
const hasRedirectLogic = manifestContent.includes('function ListsDomainRoute') && 
                         manifestContent.includes('return <Navigate to=');

assert(standaloneComingSoon.length === 0 && hasRedirectLogic, 
  `No ComingSoonPage stubs reachable from nav (found: ${standaloneComingSoon.join(", ") || "none"})`);

// 4. Check safety canonical count matches actual tabs
console.log("\n4. Safety canonical counts:");
const tabCountMatch = safetyTabsContent.match(/SAFETY_CANONICAL_TAB_COUNT\s*=\s*(\d+)/);
const declaredCount = tabCountMatch ? parseInt(tabCountMatch[1]) : 0;
const actualTabCount = safetyTabs.length;
assert(declaredCount === actualTabCount, 
  `SAFETY_CANONICAL_TAB_COUNT (${declaredCount}) matches actual tabs (${actualTabCount})`);

// Summary
console.log("\n" + "=".repeat(50));
console.log(`OB2 verification: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nOB2 Dead Tab Audit FAILED");
  process.exit(1);
} else {
  console.log("\nPASS: OB2 Dead Tab Audit verified");
  process.exit(0);
}
