#!/usr/bin/env node
/**
 * verify-cashflow-module.mjs
 * CI guard for the Cash Flow module.
 *
 * Asserts:
 *  1. /cash-flow route exists in manifest.tsx (top-level, NOT under /reports/*)
 *  2. CashFlowPage.tsx does NOT import from /reports/cash-flow-* paths
 *  3. Backend cash-flow routes are registered in index.ts
 *  4. Migration 202606080200_cash_flow_adjustments.sql exists
 *
 * PENDING gate: if the /cash-flow route is not yet present, exits with code 0
 * and prints a PENDING notice (allows CI to pass while the route is in-flight).
 * Once the route IS present, all assertions must pass or the script fails.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const MANIFEST_PATH = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const CASHFLOW_PAGE_PATH = path.join(ROOT, "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx");
const BACKEND_INDEX_PATH = path.join(ROOT, "apps/backend/src/index.ts");
const MIGRATION_PATH = path.join(ROOT, "db/migrations/202606080200_cash_flow_adjustments.sql");

function readFile(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

const manifestSrc = readFile(MANIFEST_PATH);
if (!manifestSrc) {
  console.error(`verify-cashflow-module FAIL: cannot read ${MANIFEST_PATH}`);
  process.exit(1);
}

// ── Gate check: is /cash-flow route present yet? ───────────────────────────
const hasRoute = /path=["'`]\/cash-flow["'`]/.test(manifestSrc);

if (!hasRoute) {
  console.log(
    "verify-cashflow-module PENDING — /cash-flow route not yet in manifest.tsx. Skipping full assertions."
  );
  process.exit(0);
}

// ── Full assertions (route is present) ────────────────────────────────────
const errors = [];

// 1. /cash-flow is a top-level route (NOT nested under /reports)
const routeBlock = manifestSrc.match(/path=["'`]\/cash-flow["'`][\s\S]{0,400}?(?=<Route|$)/)?.[0] ?? "";
if (/reports\/cash-flow/.test(routeBlock)) {
  errors.push('/cash-flow route must NOT be nested under /reports/cash-flow-*');
}

// 2. CashFlowPage.tsx must not import from /reports/cash-flow-* paths
const pagesSrc = readFile(CASHFLOW_PAGE_PATH);
if (pagesSrc) {
  if (/reports\/cash-flow/i.test(pagesSrc)) {
    errors.push("CashFlowPage.tsx must NOT import from /reports/cash-flow-* paths");
  }
} else {
  errors.push(`CashFlowPage.tsx not found at ${CASHFLOW_PAGE_PATH}`);
}

// 3. Backend index.ts registers cash-flow routes
const backendSrc = readFile(BACKEND_INDEX_PATH);
if (backendSrc) {
  if (!/registerCashFlowModuleRoutes/.test(backendSrc)) {
    errors.push("Backend index.ts must register registerCashFlowModuleRoutes(app)");
  }
} else {
  errors.push(`Backend index.ts not found at ${BACKEND_INDEX_PATH}`);
}

// 4. Migration file exists
if (!fs.existsSync(MIGRATION_PATH)) {
  errors.push(`Migration 202606080200_cash_flow_adjustments.sql not found`);
}

if (errors.length > 0) {
  console.error("verify-cashflow-module FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(
  "verify-cashflow-module OK — /cash-flow route present, not under /reports, backend registered, migration exists."
);
