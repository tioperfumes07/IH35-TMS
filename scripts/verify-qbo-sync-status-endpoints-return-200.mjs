#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const ROUTES = [
  {
    label: "customers",
    file: "apps/backend/src/qbo-sync/customers.routes.ts",
    path: "/api/v1/qbo-sync/customers/status",
    fetchFn: "fetchCustomersSyncStatus",
  },
  {
    label: "vendors",
    file: "apps/backend/src/qbo-sync/vendors.routes.ts",
    path: "/api/v1/qbo-sync/vendors/status",
    fetchFn: "fetchVendorsSyncStatus",
  },
  {
    label: "chart-of-accounts",
    file: "apps/backend/src/qbo-sync/chart-of-accounts.routes.ts",
    path: "/api/v1/qbo-sync/chart-of-accounts/status",
    fetchFn: "fetchChartOfAccountsSyncStatus",
  },
  {
    label: "items",
    file: "apps/backend/src/qbo-sync/items.routes.ts",
    path: "/api/v1/qbo-sync/items/status",
    fetchFn: "fetchItemsSyncStatus",
  },
];

const STATUS_SHAPE_FIELDS = [
  "total_local",
  "synced",
  "drift_detected",
  "local_only",
  "sync_error",
  "last_pull_at",
  "last_reconcile_at",
];

function fail(message) {
  console.error(`verify:qbo-sync-status-endpoints-return-200 — FAILED\n- ${message}`);
  process.exit(1);
}

for (const route of ROUTES) {
  const abs = path.join(ROOT, route.file);
  if (!fs.existsSync(abs)) {
    fail(`${route.file} not found`);
  }

  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes(route.path)) {
    fail(`${route.label} routes must expose GET ${route.path}`);
  }
  if (!src.includes(route.fetchFn)) {
    fail(`${route.label} routes must call ${route.fetchFn}`);
  }
  if (!src.includes("EMPTY_SYNC_STATUS")) {
    fail(`${route.label} routes must define EMPTY_SYNC_STATUS fallback`);
  }
  if (!/try\s*\{[\s\S]*await\s+\w+SyncStatus/.test(src)) {
    fail(`${route.label} status handler must wrap sync status fetch in try/catch`);
  }
  if (!/catch\s*\([\s\S]*reply\.send\(EMPTY_SYNC_STATUS\)/.test(src)) {
    fail(`${route.label} status handler must return EMPTY_SYNC_STATUS on fetch failure`);
  }
  for (const field of STATUS_SHAPE_FIELDS) {
    if (!src.includes(field)) {
      fail(`${route.label} EMPTY_SYNC_STATUS must include ${field}`);
    }
  }
}

for (const [panelPath, label] of [
  ["apps/frontend/src/pages/customers/CustomersSyncPanel.tsx", "CustomersSyncPanel"],
  ["apps/frontend/src/pages/vendors/VendorsSyncPanel.tsx", "VendorsSyncPanel"],
]) {
  const abs = path.join(ROOT, panelPath);
  if (!fs.existsSync(abs)) {
    fail(`${panelPath} not found`);
  }
  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes("enabled: Boolean(operatingCompanyId)")) {
    fail(`${label} must wait for operatingCompanyId before fetching status`);
  }
  if (!src.includes("statusQuery.isError") || !src.includes("statusQuery.refetch()")) {
    fail(`${label} must surface fetch errors with a Retry action`);
  }
  if (!src.includes("No sync yet")) {
    fail(`${label} must handle empty sync state with a helpful message`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
if (!packageJson.scripts?.["verify:qbo-sync-status-endpoints-return-200"]) {
  fail("package.json must define verify:qbo-sync-status-endpoints-return-200 script");
}

const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
if (!ci.includes("verify:qbo-sync-status-endpoints-return-200")) {
  fail("ci.yml must run verify:qbo-sync-status-endpoints-return-200");
}

console.log("verify:qbo-sync-status-endpoints-return-200 — OK");
