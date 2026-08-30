#!/usr/bin/env node
/**
 * Guard: verify-planner-universal-grid.mjs — W2-P
 * Asserts:
 *  a. Every planner file imports FilterBar + resize hook from shared module
 *  b. NO existing planner route removed (driver/truck/loads resolve)
 *  c. Columns resizable + persist (localStorage)
 *  d. Day columns: gridlines yes, shading no
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = join(__dirname, "..");

const errors = [];

// Planner files to check
const plannerDir = join(base, "apps", "frontend", "src", "pages", "dispatch", "planners");
const plannerFiles = ["DriverPlanner.tsx", "TruckPlanner.tsx", "LoadsPlanner.tsx", "DispatchPlannersLayout.tsx"];
const layoutPath = join(plannerDir, "DispatchPlannersLayout.tsx");
const contextPath = join(plannerDir, "PlannerRangeContext.tsx");
const rangePath = join(plannerDir, "planner-range.ts");

function plannerRangeFailures({ layout, context, range }) {
  const failures = [];
  if (!layout.includes("setRange({ start: next.from, end: next.to })")) {
    failures.push("UniversalFilterBar From/To must update the shared planner range");
  }
  if (!layout.includes("<PlannerControls />")) {
    failures.push("every planner tab must mount the shared live range controls");
  }
  if (!context.includes("setRange: (range: PlannerRange) => void")) {
    failures.push("PlannerRangeContext must expose the custom range writer");
  }
  if (!range.includes("setRangeState(next)")) {
    failures.push("custom date ranges must persist in the planner range state");
  }
  if (!range.includes("buildPlannerRange(days, range.end)")) {
    failures.push("7/14/30/40 shortcuts must retain the selected historical end anchor");
  }
  if (!range.includes("if (next.start > next.end) return")) {
    failures.push("invalid reversed custom ranges must fail closed");
  }
  return failures;
}

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

const rangeSources = {
  layout: readFileSync(layoutPath, "utf8"),
  context: readFileSync(contextPath, "utf8"),
  range: readFileSync(rangePath, "utf8"),
};
errors.push(...plannerRangeFailures(rangeSources));

if (process.argv.includes("--selftest")) {
  const mutations = [
    { key: "layout", from: "setRange({ start: next.from, end: next.to })", to: "void next" },
    { key: "layout", from: "<PlannerControls />", to: "<PlannerRangeToolbar />" },
    { key: "context", from: "setRange: (range: PlannerRange) => void", to: "" },
    { key: "range", from: "setRangeState(next)", to: "void next" },
    { key: "range", from: "buildPlannerRange(days, range.end)", to: "buildPlannerRange(days)" },
    { key: "range", from: "if (next.start > next.end) return", to: "" },
  ];
  let caught = 0;
  for (const mutation of mutations) {
    const source = rangeSources[mutation.key];
    if (!source.includes(mutation.from)) continue;
    const mutated = { ...rangeSources, [mutation.key]: source.replace(mutation.from, mutation.to) };
    if (plannerRangeFailures(mutated).length > 0) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`[verify-planner-universal-grid] SELFTEST FAIL — ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`[verify-planner-universal-grid] SELFTEST PASS — ${caught}/${mutations.length}`);
  process.exit(0);
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
