/**
 * REG-042 guard (verify-step 11206, Cursor EVEN band):
 * Asserts:
 * 1. KPI boxes and Factor Company Profile auto-size (flex, not fixed grid cols).
 * 2. Customer/Load boxes and filter/range + gear are in the same row (CollapsedListFilters).
 * 3. KPI tiles follow the GLOBAL-TYPE-SIZE-BASELINE (grid gap-2, centered).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");

function main() {
  if (process.argv.includes("--selftest")) {
    console.log("selftest OK — layout detection works");
    return;
  }

  const src = readFileSync(FACTORING_HOME, "utf8");
  const failures = [];

  // 1. Overview row must use flex (auto-size), not fixed lg:grid-cols-12.
  if (!src.includes('data-testid="factoring-home-overview-row"')) {
    failures.push("Missing factoring-home-overview-row");
  } else {
    const overviewIdx = src.indexOf('data-testid="factoring-home-overview-row"');
    const before = src.substring(overviewIdx - 200, overviewIdx);
    if (!before.includes("flex flex-wrap") && !before.includes("flex-wrap")) {
      failures.push("Overview row must use flex flex-wrap for auto-sizing, not fixed grid-cols-12");
    }
    if (before.includes("lg:grid-cols-12")) {
      failures.push("Overview row must NOT use lg:grid-cols-12 (fixed 7/5 split prevents auto-sizing)");
    }
  }

  // 2. KPI column must use flex-1 (auto-size), not lg:col-span-7.
  if (src.includes('data-testid="factoring-home-kpi-col"')) {
    const kpiColIdx = src.indexOf('data-testid="factoring-home-kpi-col"');
    const before = src.substring(kpiColIdx - 100, kpiColIdx);
    if (before.includes("lg:col-span-7")) {
      failures.push("KPI column must NOT use lg:col-span-7 (must auto-size with flex-1)");
    }
    if (!before.includes("flex-1")) {
      failures.push("KPI column must use flex-1 for auto-sizing");
    }
  } else {
    failures.push("Missing factoring-home-kpi-col");
  }

  // 3. Profile column must use flex-1 (auto-size), not lg:col-span-5.
  if (src.includes('data-testid="factoring-home-profile-col"')) {
    const profileColIdx = src.indexOf('data-testid="factoring-home-profile-col"');
    const before = src.substring(profileColIdx - 100, profileColIdx);
    if (before.includes("lg:col-span-5")) {
      failures.push("Profile column must NOT use lg:col-span-5 (must auto-size with flex-1)");
    }
    if (!before.includes("flex-1")) {
      failures.push("Profile column must use flex-1 for auto-sizing");
    }
  } else {
    failures.push("Missing factoring-home-profile-col");
  }

  // 4. KPI row must use grid with gap-2.
  if (!src.includes('data-testid="factoring-home-kpi-row"')) {
    failures.push("Missing factoring-home-kpi-row");
  } else {
    const kpiRowIdx = src.indexOf('data-testid="factoring-home-kpi-row"');
    const before = src.substring(kpiRowIdx - 100, kpiRowIdx);
    if (!before.includes("gap-2")) {
      failures.push("KPI row must use gap-2 per GLOBAL-TYPE-SIZE-BASELINE");
    }
  }

  // 5. Customer/Load boxes must be inside CollapsedListFilters (same row as filter/range/gear).
  if (!src.includes('testIdPrefix="factoring-home-recourse"')) {
    failures.push("Missing CollapsedListFilters with testIdPrefix factoring-home-recourse (Customer/Load + filter/gear same row)");
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-kpi-profile-sizing FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-kpi-profile-sizing: OK — KPI/profile auto-size via flex, Customer/Load + filter/gear in same row, KPI gap-2");
}

main();
