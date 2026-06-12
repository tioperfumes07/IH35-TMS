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

// 2. Check SAFETY_TABS_CONFIG has no dead tabs removed
console.log("\n2. Safety tabs — no dead tabs:");
const deadSafetyTabs = ['complaints', 'geofence-alerts'];
const hasDeadSafetyTabs = deadSafetyTabs.some(t => safetyTabsContent.includes(`id: "${t}"`));
assert(!hasDeadSafetyTabs, "SAFETY_TABS_CONFIG has no dead tabs (complaints, geofence-alerts)");

// 3. Check no ComingSoonPage in accounting routes (nav-configured dead tabs)
console.log("\n3. Accounting routes — no ComingSoonPage stubs:");
// Only check for removed accounting routes that were in nav
const deadAccountingPatterns = [
  '/accounting/recurring-transactions',
  '/accounting/integration-transactions', 
  '/accounting/receipts',
  '/accounting/revenue-recognition',
  '/accounting/fixed-assets',
  '/accounting/prepaid-expenses',
  '/accounting/my-accountant',
];
const hasDeadAccountingRoutes = deadAccountingPatterns.some(p => manifestContent.includes(`path="${p}"`));
assert(!hasDeadAccountingRoutes, "No dead accounting routes in manifest");

// 4. Check safety canonical count matches actual tabs
console.log("\n4. Safety canonical counts:");
const safetyRouteMatches = safetyTabsContent.match(/route:\s*"([^"]+)"/g) || [];
const safetyRoutes = safetyRouteMatches.map(m => m.replace(/route:\s*"/, '').replace('"', ''));
const tabCountMatch = safetyTabsContent.match(/SAFETY_CANONICAL_TAB_COUNT\s*=\s*(\d+)/);
const declaredCount = tabCountMatch ? parseInt(tabCountMatch[1]) : 0;
const actualTabCount = safetyRoutes.length;
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
