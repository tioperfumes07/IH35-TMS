#!/usr/bin/env node
/**
 * AUDIT-FIX-14: sub-tabs must use real pathnames (not ?subtab= query strings).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const failures = [];

const PAGE_CHECKS = [
  {
    file: "apps/frontend/src/pages/Drivers.tsx",
    module: "drivers",
    navMarkers: ["NavLink", "DRIVERS_SUBTAB_PATH"],
  },
  {
    file: "apps/frontend/src/components/safety/SafetyGroupNav.tsx",
    module: "safety",
    navMarkers: ["NavLink", "tab.route"],
  },
  {
    file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
    module: "maintenance",
    navMarkers: ["NavLink", "MAINTENANCE_TAB_PATH"],
  },
  {
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    module: "banking",
    navMarkers: ["NavLink", "BANKING_TAB_PATH"],
  },
  {
    file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    module: "factoring",
    navMarkers: ["NavLink", "FACTORING_TAB_PATH"],
  },
];

for (const check of PAGE_CHECKS) {
  const abs = path.join(repoRoot, check.file);
  if (!fs.existsSync(abs)) {
    failures.push(`${check.file} (missing)`);
    continue;
  }
  const source = fs.readFileSync(abs, "utf8");
  if (source.includes('set("subtab"') || source.includes("?subtab=")) {
    failures.push(`${check.file} (still uses ?subtab= query navigation)`);
  }
  if (!check.navMarkers.every((marker) => source.includes(marker))) {
    failures.push(`${check.file} (must use NavLink with route-manifest paths for ${check.module})`);
  }
  const hasModulePaths =
    source.includes(`/${check.module}/`) ||
    source.includes(`${check.module.toUpperCase()}_TAB_PATH`) ||
    source.includes(`${check.module.toUpperCase()}_SUBTAB_PATH`) ||
    source.includes("tab.route");
  if (!hasModulePaths) {
    failures.push(`${check.file} (missing pathname navigation for ${check.module})`);
  }
}

const manifestPath = path.join(repoRoot, "apps/frontend/src/router/route-manifest.ts");
const manifest = fs.readFileSync(manifestPath, "utf8");
for (const module of ["drivers", "maintenance", "banking", "factoring"]) {
  if (!manifest.includes(`module: "${module}"`)) {
    failures.push(`route-manifest.ts (missing ${module} sub-tab paths)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-subtabs-are-real-routes] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-subtabs-are-real-routes] OK (${PAGE_CHECKS.length} module pages guarded)`);
