/**
 * verify-planners-list-views.mjs
 *
 * Guard for the Planners module list views (K.9 + list/table upgrade).
 *
 * Checks:
 *  1. Each planner page (Driver, Truck, Loads, UnifiedTimeline) has either:
 *     - A view toggle (grid/list) using PlannerViewToggle, OR
 *     - A list/table view using ParityTable
 *  2. The list view has:
 *     - Sortable columns (ParityTable default — checks exportFilename is set)
 *     - CSV export (exportFilename prop on ParityTable)
 *     - Print button (DispatchPlannersLayout has Print)
 *     - Pagination (ParityTable default)
 *  3. DispatchPlannersLayout has the K.9 visible filter bar (defaultOpen={true})
 *
 * Exits 0 if all pass, 1 otherwise.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const plannersDir = join(repoRoot, "apps/frontend/src/pages/dispatch/planners");

const PLANNER_PAGES = [
  { file: "DriverPlanner.tsx", name: "Driver Planner" },
  { file: "TruckPlanner.tsx", name: "Truck Planner" },
  { file: "LoadsPlanner.tsx", name: "Loads Planner" },
  { file: "UnifiedTimelinePlanner.tsx", name: "Unified Timeline" },
];

let failures = 0;
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  failures += 1;
};
const pass = (msg) => console.log(`PASS: ${msg}`);

// --- Check 3: DispatchPlannersLayout K.9 visible filter bar ---
const layoutPath = join(plannersDir, "DispatchPlannersLayout.tsx");
if (!existsSync(layoutPath)) {
  fail(`DispatchPlannersLayout.tsx not found at ${layoutPath}`);
} else {
  const layoutSrc = readFileSync(layoutPath, "utf-8");
  if (layoutSrc.includes("defaultOpen={true}") || layoutSrc.includes('defaultOpen={true}')) {
    pass("DispatchPlannersLayout has K.9 visible filter bar (defaultOpen={true})");
  } else {
    fail("DispatchPlannersLayout missing defaultOpen={true} on UniversalFilterBar (K.9 visible filter bar)");
  }
  // Check Print button exists in layout
  if (layoutSrc.includes("Print") && layoutSrc.includes("window.print()")) {
    pass("DispatchPlannersLayout has Print button");
  } else {
    fail("DispatchPlannersLayout missing Print button");
  }
  // Check CSV export exists in layout
  if (layoutSrc.includes("Export CSV") || layoutSrc.includes("exportPlannerCsv")) {
    pass("DispatchPlannersLayout has CSV export button");
  } else {
    fail("DispatchPlannersLayout missing CSV export button");
  }
}

// --- Check 1 & 2: Each planner page has view toggle + ParityTable list view ---
for (const { file, name } of PLANNER_PAGES) {
  const filePath = join(plannersDir, file);
  if (!existsSync(filePath)) {
    fail(`${file} not found`);
    continue;
  }
  const src = readFileSync(filePath, "utf-8");

  // Check 1a: view toggle (grid/list)
  const hasViewToggle =
    src.includes("PlannerViewToggle") ||
    src.includes("viewMode") ||
    src.includes("planner-view-toggle");
  if (hasViewToggle) {
    pass(`${name}: has view toggle (grid/list)`);
  } else {
    fail(`${name}: missing view toggle (grid/list)`);
  }

  // Check 1b: ParityTable usage (list view)
  const hasParityTable = src.includes("ParityTable");
  if (hasParityTable) {
    pass(`${name}: has ParityTable list view`);
  } else {
    // DriverPlanner delegates to SafetyDriverSchedulerGrid — check that file too
    if (file === "DriverPlanner.tsx") {
      const gridPath = join(plannersDir, "SafetyDriverSchedulerGrid.tsx");
      if (existsSync(gridPath)) {
        const gridSrc = readFileSync(gridPath, "utf-8");
        if (gridSrc.includes("ParityTable")) {
          pass(`${name}: has ParityTable list view (in SafetyDriverSchedulerGrid)`);
        } else {
          fail(`${name}: missing ParityTable list view (not in SafetyDriverSchedulerGrid either)`);
        }
      } else {
        fail(`${name}: missing ParityTable list view (SafetyDriverSchedulerGrid not found)`);
      }
    } else {
      fail(`${name}: missing ParityTable list view`);
    }
  }

  // Check 2a: CSV export (exportFilename)
  if (src.includes("exportFilename")) {
    pass(`${name}: list view has CSV export (exportFilename)`);
  } else {
    // DriverPlanner delegates to SafetyDriverSchedulerGrid — check that file too
    if (file === "DriverPlanner.tsx") {
      const gridPath = join(plannersDir, "SafetyDriverSchedulerGrid.tsx");
      if (existsSync(gridPath)) {
        const gridSrc = readFileSync(gridPath, "utf-8");
        if (gridSrc.includes("exportFilename")) {
          pass(`${name}: list view has CSV export (exportFilename in SafetyDriverSchedulerGrid)`);
        } else {
          fail(`${name}: missing exportFilename in SafetyDriverSchedulerGrid`);
        }
      } else {
        fail(`${name}: missing exportFilename (SafetyDriverSchedulerGrid not found)`);
      }
    } else {
      fail(`${name}: missing exportFilename on ParityTable`);
    }
  }

  // Check 2b: Sortable columns — ParityTable provides sortable by default;
  // verify the page uses ParityColumn type (columns are defined)
  if (src.includes("ParityColumn") || src.includes("sortable: true")) {
    pass(`${name}: list view has sortable columns (ParityTable default)`);
  } else if (file === "DriverPlanner.tsx") {
    const gridPath = join(plannersDir, "SafetyDriverSchedulerGrid.tsx");
    if (existsSync(gridPath)) {
      const gridSrc = readFileSync(gridPath, "utf-8");
      if (gridSrc.includes("ParityColumn") || gridSrc.includes("sortable: true")) {
        pass(`${name}: list view has sortable columns (ParityTable default in SafetyDriverSchedulerGrid)`);
      } else {
        fail(`${name}: missing sortable columns in SafetyDriverSchedulerGrid`);
      }
    } else {
      fail(`${name}: missing sortable columns (SafetyDriverSchedulerGrid not found)`);
    }
  } else {
    fail(`${name}: missing sortable columns (no ParityColumn or sortable: true)`);
  }

  // Check 2c: Pagination — ParityTable provides pagination by default;
  // verify ParityTable is used (already checked above) which includes pagination
  if (hasParityTable) {
    pass(`${name}: list view has pagination (ParityTable default)`);
  } else if (file === "DriverPlanner.tsx") {
    const gridPath = join(plannersDir, "SafetyDriverSchedulerGrid.tsx");
    if (existsSync(gridPath)) {
      const gridSrc = readFileSync(gridPath, "utf-8");
      if (gridSrc.includes("ParityTable")) {
        pass(`${name}: list view has pagination (ParityTable default in SafetyDriverSchedulerGrid)`);
      } else {
        fail(`${name}: missing pagination (no ParityTable in SafetyDriverSchedulerGrid)`);
      }
    } else {
      fail(`${name}: missing pagination (SafetyDriverSchedulerGrid not found)`);
    }
  } else {
    fail(`${name}: missing pagination (no ParityTable)`);
  }
}

// --- Summary ---
if (failures === 0) {
  console.log("\nAll planner list view checks passed.");
  process.exit(0);
} else {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
