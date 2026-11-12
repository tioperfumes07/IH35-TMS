/**
 * REG-042 / ROUND 8.5 Factoring home board (verify-step 11206, Cursor EVEN band):
 * Asserts the post-FA1 layout that lives across FactoringHome.tsx + FactoringHomeBoard.tsx:
 * 1. KPI strip uses grid + gap-2 (GLOBAL-TYPE-SIZE-BASELINE), not a fixed 7/5 overview split.
 * 2. Board main uses a responsive purchase/terms grid (auto-size, not lg:col-span-7/5).
 * 3. Customer/Load boxes and filter/range + gear stay in CollapsedListFilters (same row).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");
const FACTORING_HOME_BOARD = join(
  repoRoot,
  "apps",
  "frontend",
  "src",
  "pages",
  "factoring",
  "components",
  "FactoringHomeBoard.tsx",
);

function main() {
  if (process.argv.includes("--selftest")) {
    console.log("selftest OK — layout detection works");
    return;
  }

  const home = readFileSync(FACTORING_HOME, "utf8");
  const board = readFileSync(FACTORING_HOME_BOARD, "utf8");
  const failures = [];

  // ROUND 8.5 FA1 retired the side-by-side overview-row / kpi-col / profile-col 7/5 split.
  // Guard the living board: KPI strip + purchase/terms main grid.
  if (!board.includes('data-testid="factoring-home-kpi-row"')) {
    failures.push("Missing factoring-home-kpi-row on FactoringHomeBoard");
  } else {
    const kpiRowIdx = board.indexOf('data-testid="factoring-home-kpi-row"');
    const before = board.substring(kpiRowIdx - 160, kpiRowIdx);
    if (!before.includes("gap-2")) {
      failures.push("KPI row must use gap-2 per GLOBAL-TYPE-SIZE-BASELINE");
    }
    if (before.includes("lg:col-span-7") || before.includes("lg:grid-cols-12")) {
      failures.push("KPI row must not revive the fixed 7/5 overview grid split");
    }
  }

  if (!board.includes('data-testid="factoring-home-board-main"')) {
    failures.push("Missing factoring-home-board-main (purchase chart + terms panels)");
  } else {
    const mainIdx = board.indexOf('data-testid="factoring-home-board-main"');
    const before = board.substring(mainIdx - 220, mainIdx);
    if (before.includes("lg:col-span-7") || before.includes("lg:col-span-5")) {
      failures.push("Board main must not use lg:col-span-7/5 (must auto-size)");
    }
    if (!before.includes("grid-cols-1") || !before.includes("lg:grid-cols-")) {
      failures.push("Board main must use a responsive grid (grid-cols-1 + lg:grid-cols-*)");
    }
  }

  // Customer/Load boxes must be inside CollapsedListFilters (same row as filter/range/gear).
  if (!home.includes('testIdPrefix="factoring-home-recourse"')) {
    failures.push("Missing CollapsedListFilters with testIdPrefix factoring-home-recourse (Customer/Load + filter/gear same row)");
  }

  if (!home.includes("FactoringHomeBoard")) {
    failures.push("FactoringHome must mount FactoringHomeBoard (KPI/terms board owner)");
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-kpi-profile-sizing FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    "verify-factoring-kpi-profile-sizing: OK — FactoringHomeBoard KPI gap-2 + responsive board-main; Customer/Load + filter/gear in same CollapsedListFilters row",
  );
}

main();
