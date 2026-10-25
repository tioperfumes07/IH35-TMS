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
  const navMarkerOk = check.navMarkers.every((marker) => {
    if (marker === "NavLink") {
      if (source.includes("NavLink") || source.includes("NavyPageSubNav") || source.includes("HoverDropdownNav")) return true;
      // 443.326 board grammar moved the sub-nav into a local board-chrome component (e.g. FactoringBoardChrome
      // renders <HoverDropdownNav items={…} /> from route-manifest subnavItems). Follow relative imports one level.
      for (const m of source.matchAll(/from\s+"(\.\/[A-Za-z0-9_-]+)"/g)) {
        const sib = path.join(path.dirname(abs), `${m[1]}.tsx`);
        if (!fs.existsSync(sib)) continue;
        const sibSrc = fs.readFileSync(sib, "utf8");
        const name = path.basename(m[1]);
        if (
          (sibSrc.includes("NavyPageSubNav") || sibSrc.includes("NavLink") || sibSrc.includes("HoverDropdownNav")) &&
          source.includes(`<${name}`) &&
          source.includes("subnavItems")
        ) return true;
      }
      return false;
    }
    return source.includes(marker);
  });
  if (!navMarkerOk) {
    failures.push(`${check.file} (must use NavLink or NavyPageSubNav with route-manifest paths for ${check.module})`);
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
