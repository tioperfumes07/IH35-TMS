#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

const SUB_VIEWS = [
  { slug: "debt-history", service: "debt-history.service.ts", page: "DebtHistoryView.tsx" },
  { slug: "payroll-history", service: "payroll-history.service.ts", page: "PayrollHistoryView.tsx" },
  { slug: "escrow-history", service: "escrow-history.service.ts", page: "EscrowHistoryView.tsx" },
  { slug: "permit-history", service: "permit-history.service.ts", page: "PermitHistoryView.tsx" },
  { slug: "accident-history", service: "accident-history.service.ts", page: "AccidentHistoryView.tsx" },
  { slug: "settlement-history", service: "settlement-history.service.ts", page: "SettlementHistoryView.tsx" },
  { slug: "fuel-history", service: "fuel-history.service.ts", page: "FuelHistoryView.tsx" },
  { slug: "maintenance-assignments", service: "maintenance-assignments.service.ts", page: "MaintenanceAssignmentsView.tsx" },
  { slug: "safety-events", service: "safety-events.service.ts", page: "SafetyEventsView.tsx" },
  { slug: "communications-log", service: "communications-log.service.ts", page: "CommunicationsLogView.tsx" },
  { slug: "pwa-engagement", service: "pwa-engagement.service.ts", page: "PwaEngagementView.tsx" },
  { slug: "documents-vault", service: "documents-vault.service.ts", page: "DocumentsVaultView.tsx" },
];

const BACKEND_DIR = "apps/backend/src/master-data/drivers/operations-depth";
const PAGE_DIR = "apps/frontend/src/pages/drivers/operations";

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

if (SUB_VIEWS.length !== 12) {
  fail(`expected 12 sub-views, found ${SUB_VIEWS.length}`);
}

// 12 backend services exist
for (const subView of SUB_VIEWS) {
  read(`${BACKEND_DIR}/${subView.service}`);
}

// Routes file registers all 12 sub-views + exports the register fn
const routes = read(`${BACKEND_DIR}/routes.ts`);
contains(`${BACKEND_DIR}/routes.ts`, routes, [
  { pattern: /registerDriverOperationsDepthRoutes/, label: "routes register export" },
  { pattern: /\/api\/drivers\/:uuid\/operations\/\$\{subView\.slug\}/, label: "operations route template" },
  { pattern: /assertDriverScope/, label: "driver tenant scope guard" },
]);
for (const subView of SUB_VIEWS) {
  contains(`${BACKEND_DIR}/routes.ts`, routes, [
    { pattern: new RegExp(`slug:\\s*"${subView.slug}"`), label: `route registered: ${subView.slug}` },
  ]);
}

// Backend tests exist
read(`${BACKEND_DIR}/__tests__/operations-depth.test.ts`);

// index.ts wires the routes
const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /import\s*\{\s*registerDriverOperationsDepthRoutes\s*\}/, label: "routes import" },
  { pattern: /await registerDriverOperationsDepthRoutes\(app\)/, label: "routes registered in index" },
]);

// 12 frontend page components exist
for (const subView of SUB_VIEWS) {
  read(`${PAGE_DIR}/${subView.page}`);
}

// OperationsDepthNav lists all 12 sub-views
const nav = read("apps/frontend/src/components/drivers/OperationsDepthNav.tsx");
for (const subView of SUB_VIEWS) {
  contains("apps/frontend/src/components/drivers/OperationsDepthNav.tsx", nav, [
    { pattern: new RegExp(`slug:\\s*"${subView.slug}"`), label: `nav lists: ${subView.slug}` },
  ]);
}

// DriverDetail mounts the Operations tab + nav
const driverDetail = read("apps/frontend/src/pages/DriverDetail.tsx");
contains("apps/frontend/src/pages/DriverDetail.tsx", driverDetail, [
  { pattern: /"Operations"/, label: "Operations tab in tabs list" },
  { pattern: /OperationsDepthNav/, label: "OperationsDepthNav mounted" },
]);

// Docs spec
const docs = read("docs/specs/gap-48-driver-operations-depth.md");
contains("docs/specs/gap-48-driver-operations-depth.md", docs, [
  { pattern: /GAP-48/, label: "GAP-48 identifier" },
  { pattern: /\/api\/drivers\/.*\/operations\//, label: "operations routes documented" },
]);

// Manifest present
read(".block-ready/GAP-48.json");

if (failures.length > 0) {
  console.error("verify:driver-operations-depth — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log(`verify:driver-operations-depth — OK (${SUB_VIEWS.length} sub-views)`);
