#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const migrationPath = path.join(ROOT, "db/migrations/0377_qbo_customer_vendor_sync_metadata.sql");
const customersPullerPath = path.join(ROOT, "apps/backend/src/qbo-sync/customers-puller.ts");
const vendorsPullerPath = path.join(ROOT, "apps/backend/src/qbo-sync/vendors-puller.ts");
const customersReconcilerPath = path.join(ROOT, "apps/backend/src/qbo-sync/customers-reconciler.ts");
const vendorsReconcilerPath = path.join(ROOT, "apps/backend/src/qbo-sync/vendors-reconciler.ts");
const customersRoutesPath = path.join(ROOT, "apps/backend/src/qbo-sync/customers.routes.ts");
const vendorsRoutesPath = path.join(ROOT, "apps/backend/src/qbo-sync/vendors.routes.ts");
const customersPanelPath = path.join(ROOT, "apps/frontend/src/pages/customers/CustomersSyncPanel.tsx");
const vendorsPanelPath = path.join(ROOT, "apps/frontend/src/pages/vendors/VendorsSyncPanel.tsx");

function fail(message) {
  console.error(`verify:qbo-sync-customer-vendor-counts — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [
  migrationPath,
  customersPullerPath,
  vendorsPullerPath,
  customersReconcilerPath,
  vendorsReconcilerPath,
  customersRoutesPath,
  vendorsRoutesPath,
  customersPanelPath,
  vendorsPanelPath,
]) {
  if (!fs.existsSync(file)) {
    fail(`${path.relative(ROOT, file)} not found`);
  }
}

const migration = fs.readFileSync(migrationPath, "utf8");
if (!migration.includes("mdata.customers") || !migration.includes("mdata.vendors")) {
  fail("migration must add sync metadata to mdata.customers and mdata.vendors");
}
if (!migration.includes("local_only") || !migration.includes("drift_detected")) {
  fail("migration must constrain qbo_sync_status values including local_only and drift_detected");
}

const customersReconciler = fs.readFileSync(customersReconcilerPath, "utf8");
if (!customersReconciler.includes("qbo_customer_id IS NULL")) {
  fail("customers reconciler must detect local rows without qbo_customer_id");
}
if (!customersReconciler.includes("local_only")) {
  fail("customers reconciler must respect local_only status");
}

const vendorsReconciler = fs.readFileSync(vendorsReconcilerPath, "utf8");
if (!vendorsReconciler.includes("qbo_vendor_id IS NULL")) {
  fail("vendors reconciler must detect local rows without qbo_vendor_id");
}
if (!vendorsReconciler.includes("local_only")) {
  fail("vendors reconciler must respect local_only status");
}

for (const [label, routes, paths] of [
  ["customers", customersRoutesPath, [
    "/api/v1/qbo-sync/customers/pull-now",
    "/api/v1/qbo-sync/customers/reconcile-now",
    "/api/v1/qbo-sync/customers/status",
  ]],
  ["vendors", vendorsRoutesPath, [
    "/api/v1/qbo-sync/vendors/pull-now",
    "/api/v1/qbo-sync/vendors/reconcile-now",
    "/api/v1/qbo-sync/vendors/status",
  ]],
]) {
  const routesSrc = fs.readFileSync(routes, "utf8");
  for (const route of paths) {
    if (!routesSrc.includes(route)) {
      fail(`${label} routes must expose ${route}`);
    }
  }
}

const customersPage = path.join(ROOT, "apps/frontend/src/pages/Customers.tsx");
const vendorsPage = path.join(ROOT, "apps/frontend/src/pages/Vendors.tsx");
for (const [pagePath, panelImport] of [
  [customersPage, "CustomersSyncPanel"],
  [vendorsPage, "VendorsSyncPanel"],
]) {
  if (!fs.existsSync(pagePath)) {
    fail(`${path.relative(ROOT, pagePath)} not found`);
  }
  const pageSrc = fs.readFileSync(pagePath, "utf8");
  if (!pageSrc.includes(panelImport)) {
    fail(`${path.relative(ROOT, pagePath)} must render ${panelImport}`);
  }
}

console.log("verify:qbo-sync-customer-vendor-counts — OK");
