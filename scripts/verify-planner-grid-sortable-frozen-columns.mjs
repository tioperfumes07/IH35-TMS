#!/usr/bin/env node
// Planners lists (owner order 2026-09-05, item 3 of "L.4c / 2.2 / Planners lists"): "server-
// paginated + sortable + landing filter + export". Landing filter + export were already shipped
// (verify-planners-lists-parity.mjs). This guard covers the "sortable" half: PlannerGrid's shared
// frozen-column header (Name/Status) is click-to-sort, and each of the three planners (Driver,
// Truck, Loads) supplies the plain-text sortKey/statusSortKey the sort needs.
//
// "server-paginated" is NOT attempted here — see the PR body for why a calendar/timeline grid
// (every row for the visible date range needs to be on screen at once to scan across the roster)
// is a different UX shape than a paginated list, and the coordination note filed to Cascade.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-planner-grid-sortable-frozen-columns";

const GRID = "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx";
const CALLERS = [
  "apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx",
  "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
  "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
];

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  let grid;
  try {
    grid = read(GRID, root);
  } catch {
    problems.push(`missing ${GRID}`);
    return problems;
  }
  if (!/\btoggleSort\s*=/.test(grid) || !/onClick=\{\(\)\s*=>\s*toggleSort\(/.test(grid)) {
    problems.push(`${GRID}: no toggleSort — frozen columns not sortable`);
  }
  if (!/sortedRows/.test(grid)) problems.push(`${GRID}: rows must render from a sortedRows computation, not raw rows`);
  if (!/data-testid="planner-grid-sort-name"/.test(grid)) problems.push(`${GRID}: missing planner-grid-sort-name button`);
  if (!/data-testid="planner-grid-sort-status"/.test(grid)) problems.push(`${GRID}: missing planner-grid-sort-status button`);

  for (const caller of CALLERS) {
    let src;
    try {
      src = read(caller, root);
    } catch {
      problems.push(`missing ${caller}`);
      continue;
    }
    if (!/sortKey:/.test(src)) problems.push(`${caller}: does not supply sortKey to PlannerGrid rows`);
  }
  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);
  // Mutation-proof against the real files: strip toggleSort from PlannerGrid, and sortKey from
  // one caller, via a temp copy so we're testing against real content, not an invented fixture.
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "planner-sort-guard-"));
  try {
    for (const rel of [GRID, ...CALLERS]) {
      const dest = path.join(tmpRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }
    const gridPath = path.join(tmpRoot, GRID);
    const gridSrc = fs.readFileSync(gridPath, "utf8").replace(/toggleSort/g, "toggleSortREMOVED");
    fs.writeFileSync(gridPath, gridSrc);
    const callerPath = path.join(tmpRoot, CALLERS[0]);
    const callerSrc = fs.readFileSync(callerPath, "utf8").replace(/sortKey:/g, "sortKeyREMOVED:");
    fs.writeFileSync(callerPath, callerSrc);
    const planted = collectProblems(tmpRoot);
    if (planted.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL: expected at least 2 problems on the planted mutant, got ${planted.length}: ${JSON.stringify(planted)}`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — PlannerGrid's Name/Status frozen columns are click-to-sort, all three planners supply sort keys`);
}
