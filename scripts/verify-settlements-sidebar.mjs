#!/usr/bin/env node
/**
 * verify-settlements-sidebar.mjs
 * Assert SETTLEMENTS-SIDEBAR-RENAME-MOVE deliverables.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`[verify-settlements-sidebar] FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}
let failed = false;
function fail(msg) { console.error(`[verify-settlements-sidebar] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-settlements-sidebar] PASS: ${msg}`); }

const config = read("apps/frontend/src/components/layout/sidebar-config.ts");

// settlements id exists in SIDEBAR_ITEM_IDS
if (!config.includes('"settlements"')) fail("SIDEBAR_ITEM_IDS missing settlements id");
else pass("settlements id present in SIDEBAR_ITEM_IDS");

// settlements meta has label SETTLEMENTS
if (!config.includes('label: "SETTLEMENTS"')) fail("settlements meta missing label SETTLEMENTS");
else pass("settlements meta has label SETTLEMENTS");

// settlements routes to driver-finance/settlements
if (!config.includes('"/driver-finance/settlements"')) fail("settlements meta missing correct route");
else pass("settlements routes to /driver-finance/settlements");

// settlements uses Receipt icon
if (!config.includes("Receipt")) fail("settlements meta missing Receipt icon");
else pass("settlements uses Receipt icon");

// cash-flow → settlements → accounting ordering
const ids = config.match(/"cash-flow"[\s\S]*?"settlements"[\s\S]*?"accounting"/);
if (!ids) fail("cash-flow → settlements → accounting ordering not found");
else pass("cash-flow → settlements → accounting ordering correct");

// Payroll hardcoded NavLink removed from Sidebar.tsx
const sidebar = read("apps/frontend/src/components/Sidebar.tsx");
if (sidebar.includes("PAYROLL") || sidebar.includes("payroll-integration")) fail("Sidebar.tsx still has hardcoded PAYROLL NavLink");
else pass("Sidebar.tsx has no hardcoded PAYROLL NavLink");

// Scale import removed from Sidebar.tsx
if (sidebar.includes('from "lucide-react"') && sidebar.includes("Scale")) fail("Sidebar.tsx still imports Scale (unused after PAYROLL removal)");
else pass("Sidebar.tsx Scale import removed");

// sidebar-contract guard passes (run it inline)
const { execSync } = await import("node:child_process");
try {
  execSync("node scripts/verify-sidebar-contract.mjs", { cwd: ROOT, stdio: "pipe" });
  pass("verify-sidebar-contract passes (28 items, adjacency correct)");
} catch (e) {
  fail(`verify-sidebar-contract failed: ${e.stderr?.toString() ?? e.message}`);
}

if (failed) { console.error("\n[verify-settlements-sidebar] FAILED"); process.exit(1); }
console.log("\n[verify-settlements-sidebar] ALL CHECKS PASSED");
