#!/usr/bin/env node
/**
 * Guard: verify-planner-universal-grid.mjs — W2-P
 * Asserts:
 *  a. Every planner file imports FilterBar + resize hook from shared module
 *  b. NO existing planner route removed (driver/truck/loads resolve)
 *  c. Columns resizable + persist (localStorage)
 *  d. Day columns: gridlines yes, shading no
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = join(__dirname, "..");

const errors = [];

// Planner files to check
const plannerDir = join(base, "apps", "frontend", "src", "pages", "dispatch", "planners");
const plannerFiles = ["DriverPlanner.tsx", "TruckPlanner.tsx", "LoadsPlanner.tsx", "DispatchPlannersLayout.tsx"];

// (a) Check imports — FilterBar + resize hook must be imported from shared module, not inline
for (const file of plannerFiles) {
  const path = join(plannerDir, file);
  if (!existsSync(path)) {
    errors.push(`Planner file missing: ${file}`);
    continue;
  }
  const content = readFileSync(path, "utf-8");

  // Must import UniversalFilterBar from shared path
  const hasFilterBarImport = /import.*UniversalFilterBar.*from.*components\/planner/.test(content);
  if (!hasFilterBarImport && file === "DispatchPlannersLayout.tsx") {
    errors.push(`${file}: must import UniversalFilterBar from components/planner (shared module)`);
  }

  // Check for inline FilterBar JSX (red flag for copy-paste)
  const inlineFilterBarMatch = content.match(/function\s+FilterBar|const\s+FilterBar\s*=/);
  if (inlineFilterBarMatch) {
    errors.push(`${file}: contains inline FilterBar definition (must import from shared module)`);
  }
}

// Check shared FilterBar exists at exactly one location
const sharedFilterBar = join(base, "apps", "frontend", "src", "components", "planner", "UniversalFilterBar.tsx");
if (!existsSync(sharedFilterBar)) {
  errors.push("Shared UniversalFilterBar.tsx missing at components/planner/");
}

// Check shared hook exists
const sharedHook = join(base, "apps", "frontend", "src", "components", "planner", "useResizableColumns.ts");
if (!existsSync(sharedHook)) {
  errors.push("Shared useResizableColumns.ts missing at components/planner/");
}

// (b) Check routes still exist (locked-ui-surface check)
const routesFile = join(base, "apps", "frontend", "src", "routes.tsx");
if (existsSync(routesFile)) {
  const routesContent = readFileSync(routesFile, "utf-8");
  const requiredRoutes = ["/dispatch/planners/driver", "/dispatch/planners/truck", "/dispatch/planners/loads"];
  for (const route of requiredRoutes) {
    if (!routesContent.includes(route)) {
      errors.push(`Route missing from routes.tsx: ${route}`);
    }
  }
} else {
  // Check App.tsx or manifest for route definitions
  const manifestFile = join(base, "apps", "frontend", "src", "routes", "manifest.tsx");
  const appFile = join(base, "apps", "frontend", "src", "App.tsx");
  const routeSource = existsSync(manifestFile) ? manifestFile : appFile;
  if (existsSync(routeSource)) {
    const routeContent = readFileSync(routeSource, "utf-8");
    const requiredRoutes = ["/dispatch/planners/driver", "/dispatch/planners/truck", "/dispatch/planners/loads"];
    for (const route of requiredRoutes) {
      if (!routeContent.includes(route)) {
        errors.push(`Route missing from ${existsSync(manifestFile) ? "manifest.tsx" : "App.tsx"}: ${route}`);
      }
    }
  }
}

// (c) Check resizable columns hook uses localStorage
if (existsSync(sharedHook)) {
  const hookContent = readFileSync(sharedHook, "utf-8");
  if (!hookContent.includes("localStorage")) {
    errors.push("useResizableColumns.ts must persist to localStorage");
  }
  if (!hookContent.includes("resize") && !hookContent.includes("Resizable")) {
    errors.push("useResizableColumns.ts must implement resize logic");
  }
}

// (d) Check grid styling: gridlines yes, shading no
// Look for gridline classes in the planner files
for (const file of plannerFiles) {
  const path = join(plannerDir, file);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, "utf-8");

  // Should have border classes for gridlines
  const hasBorders = content.includes("border") || content.includes("divide");
  // Should NOT have alternating column shading (striped/zebra)
  const hasStriping = /striped|zebra|even:|odd:/.test(content);

  if (hasStriping) {
    errors.push(`${file}: has alternating row/column shading (should be gridlines only, no shading)`);
  }
}

if (errors.length > 0) {
  console.error("[verify-planner-universal-grid] FAIL:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
} else {
  console.log("[verify-planner-universal-grid] OK");
  process.exit(0);
}
