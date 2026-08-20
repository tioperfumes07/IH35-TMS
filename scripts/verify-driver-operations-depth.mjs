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

// DRV-LINK-OPS-FR — ratchet both-way EntityLinks on ops history leaves that already return FKs.
const payrollPage = read(`${PAGE_DIR}/PayrollHistoryView.tsx`);
contains(`${PAGE_DIR}/PayrollHistoryView.tsx`, payrollPage, [
  { pattern: /entityKind:\s*"settlement"/, label: "payroll → settlement EntityLink" },
  { pattern: /idKey:\s*"uuid"/, label: "payroll settlement idKey=uuid" },
]);
const accidentPage = read(`${PAGE_DIR}/AccidentHistoryView.tsx`);
contains(`${PAGE_DIR}/AccidentHistoryView.tsx`, accidentPage, [
  { pattern: /entityKind:\s*"accident"/, label: "accident → accident EntityLink" },
  { pattern: /entityKind:\s*"vendor"/, label: "accident → vendor EntityLink" },
  { pattern: /entityKind:\s*"unit"/, label: "accident → unit EntityLink" },
  { pattern: /entityKind:\s*"load"/, label: "accident → load EntityLink" },
]);
const fuelPage = read(`${PAGE_DIR}/FuelHistoryView.tsx`);
contains(`${PAGE_DIR}/FuelHistoryView.tsx`, fuelPage, [
  { pattern: /entityKind:\s*"vendor"/, label: "fuel → vendor EntityLink" },
  { pattern: /entityKind:\s*"unit"/, label: "fuel → unit EntityLink" },
  { pattern: /entityKind:\s*"load"/, label: "fuel → load EntityLink" },
]);
const fuelSvc = read(`${BACKEND_DIR}/fuel-history.service.ts`);
contains(`${BACKEND_DIR}/fuel-history.service.ts`, fuelSvc, [
  { pattern: /ft\.vendor_id::text/, label: "fuel SELECT projects vendor_id" },
  { pattern: /ft\.unit_id::text/, label: "fuel SELECT projects unit_id" },
  { pattern: /ft\.load_id::text/, label: "fuel SELECT projects load_id" },
  { pattern: /NULLIF\(TRIM\(u\.unit_number\), ''\) AS unit_number/, label: "fuel SELECT projects human unit label" },
  { pattern: /NULLIF\(TRIM\(l\.load_number\), ''\) AS load_number/, label: "fuel SELECT projects human load label" },
  { pattern: /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$2::uuid/, label: "fuel unit label join is company scoped" },
  { pattern: /l\.operating_company_id = \$2::uuid/, label: "fuel load label join is company scoped" },
]);
const accidentSvc = read(`${BACKEND_DIR}/accident-history.service.ts`);
contains(`${BACKEND_DIR}/accident-history.service.ts`, accidentSvc, [
  { pattern: /ar\.id::text AS uuid/, label: "accident joined SELECT keeps id unambiguous" },
  { pattern: /NULLIF\(TRIM\(u\.unit_number\), ''\) AS unit_number/, label: "accident SELECT projects human unit label" },
  { pattern: /NULLIF\(TRIM\(l\.load_number\), ''\) AS load_number/, label: "accident SELECT projects human load label" },
  { pattern: /NULLIF\(TRIM\(v\.vendor_name\), ''\) AS vendor_name/, label: "accident SELECT projects human vendor label" },
  { pattern: /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$2::uuid/, label: "accident unit label join is company scoped" },
  { pattern: /l\.operating_company_id = \$2::uuid/, label: "accident load label join is company scoped" },
  { pattern: /v\.operating_company_id = \$2::uuid/, label: "accident vendor label join is company scoped" },
]);
contains(`${PAGE_DIR}/AccidentHistoryView.tsx`, accidentPage, [
  { pattern: /key:\s*"unit_number"[\s\S]*idKey:\s*"unit_id"/, label: "accident unit renders human label over canonical id" },
  { pattern: /key:\s*"load_number"[\s\S]*idKey:\s*"load_id"/, label: "accident load renders human label over canonical id" },
  { pattern: /key:\s*"vendor_name"[\s\S]*idKey:\s*"vendor_id"/, label: "accident vendor renders human label over canonical id" },
]);
contains(`${PAGE_DIR}/FuelHistoryView.tsx`, fuelPage, [
  { pattern: /key:\s*"unit_number"[\s\S]*idKey:\s*"unit_id"/, label: "fuel unit renders human label over canonical id" },
  { pattern: /key:\s*"load_number"[\s\S]*idKey:\s*"load_id"/, label: "fuel load renders human label over canonical id" },
]);

if (process.argv.includes("--selftest")) {
  const planted = [
    ["fuel unit producer label", fuelSvc.replace("NULLIF(TRIM(u.unit_number), '') AS unit_number", "ft.unit_id::text AS unit_number"), /NULLIF\(TRIM\(u\.unit_number\), ''\) AS unit_number/],
    ["fuel load producer scope", fuelSvc.replace("AND l.operating_company_id = $2::uuid", "AND l.id IS NOT NULL"), /l\.operating_company_id = \$2::uuid/],
    ["accident vendor producer label", accidentSvc.replace("NULLIF(TRIM(v.vendor_name), '') AS vendor_name", "ar.vendor_id::text AS vendor_name"), /NULLIF\(TRIM\(v\.vendor_name\), ''\) AS vendor_name/],
    ["accident unit consumer label", accidentPage.replace('key: "unit_number"', 'key: "unit_id"'), /key:\s*"unit_number"[\s\S]*idKey:\s*"unit_id"/],
    ["fuel load consumer label", fuelPage.replace('key: "load_number"', 'key: "load_id"'), /key:\s*"load_number"[\s\S]*idKey:\s*"load_id"/],
  ];
  const escaped = planted.filter(([, mutated, expected]) => expected.test(mutated));
  if (escaped.length) {
    console.error(`verify:driver-operations-depth — SELFTEST FAILED: ${escaped.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify:driver-operations-depth — SELFTEST OK (${planted.length} planted defects detected)`);
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
