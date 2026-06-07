#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

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

const service = read("apps/backend/src/driver-manager/role-views/dm-home.service.ts");
contains("apps/backend/src/driver-manager/role-views/dm-home.service.ts", service, [
  { pattern: /getDriverManagerHomeData/, label: "getDriverManagerHomeData export" },
  { pattern: /unread_driver_comms/, label: "unread comms KPI" },
  { pattern: /late_arrivals_7d/, label: "late arrivals KPI" },
  { pattern: /pending_settlements/, label: "pending settlements KPI" },
  { pattern: /severity_rank/, label: "attention items sorted by severity" },
  { pattern: /mdata\.driver_profile_messages/, label: "driver comms source" },
]);

const routes = read("apps/backend/src/driver-manager/role-views/routes.ts");
contains("apps/backend/src/driver-manager/role-views/routes.ts", routes, [
  { pattern: /\/api\/driver-manager\/role-home/, label: "role-home route" },
  { pattern: /registerDriverManagerRoleHomeRoutes/, label: "routes register export" },
  { pattern: /Manager/, label: "Manager RBAC" },
]);

read("apps/backend/src/driver-manager/role-views/__tests__/dm-home.test.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerDriverManagerRoleHomeRoutes/, label: "driver manager routes registered in index" },
]);

const homePage = read("apps/frontend/src/pages/home/HomePage.tsx");
contains("apps/frontend/src/pages/home/HomePage.tsx", homePage, [
  { pattern: /DriverManagerHome/, label: "Driver Manager role branch" },
  { pattern: /case "Manager"/, label: "Manager case in role router" },
]);

const driverManagerHome = read("apps/frontend/src/pages/home/roles/DriverManagerHome.tsx");
contains("apps/frontend/src/pages/home/roles/DriverManagerHome.tsx", driverManagerHome, [
  { pattern: /DriverManagerKpiBar/, label: "DriverManagerKpiBar render" },
  { pattern: /DriverManagerAttentionPanel/, label: "DriverManagerAttentionPanel render" },
  { pattern: /\/api\/driver-manager\/role-home/, label: "role-home API fetch" },
]);

read("apps/frontend/src/components/home/DriverManagerKpiBar.tsx");
read("apps/frontend/src/components/home/DriverManagerAttentionPanel.tsx");

const docs = read("docs/specs/gap-69-driver-manager-home-view.md");
contains("docs/specs/gap-69-driver-manager-home-view.md", docs, [
  { pattern: /GAP-69/, label: "GAP-69 identifier" },
  { pattern: /api\/driver-manager\/role-home/, label: "route documented" },
]);

const manifest = read(".block-ready/GAP-69-DRIVER-MANAGER-HOME.json");
contains(".block-ready/GAP-69-DRIVER-MANAGER-HOME.json", manifest, [
  { pattern: /GAP-69-DRIVER-MANAGER-HOME/, label: "GAP-69 block id in manifest" },
  { pattern: /verify:driver-manager-home/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:driver-manager-home/, label: "npm script for verify gate" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:driver-manager-home/, label: "CI workflow runs verify gate" },
]);

if (failures.length > 0) {
  console.error("verify:driver-manager-home — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:driver-manager-home — OK");
