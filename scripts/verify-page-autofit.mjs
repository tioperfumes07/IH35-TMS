#!/usr/bin/env node
// ROUND-20.7 — APP-WIDE AUTOFIT LAW (permanent). Owner standing ruling, given 2026-09-11 (Truck
// Line V10) and again 2026-09-12: "i told you to make all pages in the app autoadjustable to size
// of the page, so things do not look out of proportion." Measured violation that proved it: a 2234px
// content shell handed only 1400px to apps/frontend/src/pages/dispatch/planners/
// DispatchPlannersLayout.tsx and PlannerCalendarPage.tsx (both `mx-auto max-w-[1400px]`), throwing
// away 834px and forcing the planner grid's own horizontal scroll to cover a date range that would
// otherwise have fit.
//
// SCOPE (honest, not the Lead's own claimed 19/22-file count — re-measured directly against the
// live tree before writing this guard, per this repo's own "board numbers are the least reliable
// part" law: a bare `grep -rlnE 'max-w-\[[12][0-9]{3}px\]'` across apps/frontend/src found 6 real
// page-shell-scale occurrences total, not 41. This guard covers the DATA-BOARD pages fixed in this
// same PR; PAGE_ROOTS is a registry to extend as more data-board pages are swept, not a claim that
// every page in the app has been converted yet):
//   A) DATA_BOARD_FILES — a page-level container on these routes must never carry a fixed
//      max-w-[NNNpx] cap (Tailwind arbitrary-value px, any digit count).
//   B) PlannerGrid.tsx — every pg-col-sec/pg-col-unit/pg-col-status/pg-col-action render must pass
//      a title= prop (pg-col-name already did; a long secondary/unit/status/action value clips
//      exactly the same way under the shared overflow:hidden + white-space:nowrap rule).
//
// --selftest plants both mutations (a max-w-[1400px] reintroduced, a title= dropped) against
// in-memory copies of the real source and requires the guard to FAIL each time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Registry, not a total inventory — extend as more data-board pages are converted. The 4 entries
// below already carry no page-level max-w[NNNpx] cap (built that way from the start this session,
// not converted here) — added to LOCK that in, so none of them regrows one later.
const DATA_BOARD_FILES = [
  "apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx",
  "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx",
  "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx",
  "apps/frontend/src/pages/dispatch/RoundTrips.tsx",
  "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx",
  "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
];

const PLANNER_GRID_FILE = "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx";
const TITLED_COL_CLASSES = ["pg-col-sec", "pg-col-unit", "pg-col-status", "pg-col-action"];

// Page-shell scale only (>= 900px) — DispatchKanban.tsx (in this registry) legitimately carries
// small component-level max-w-[90px]/[110px] caps (a lane-label span, a driver-name truncation),
// unrelated to "no page-level px cap"; a bare any-digit-count regex would false-positive on those.
const MAX_W_PX_RE = /max-w-\[(9[0-9]{2}|[1-9][0-9]{3,})px\]/;

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function auditDataBoardCaps(fileContents) {
  const failures = [];
  for (const [relPath, src] of fileContents) {
    const m = MAX_W_PX_RE.exec(src);
    if (m) failures.push(`${relPath}: carries a fixed page-level ${m[0]} — data boards get no px cap`);
  }
  return failures;
}

/** For each TITLED_COL_CLASSES className, find its JSX opening-tag block (up to the next `>`) and
 * require a `title=` prop inside that same tag. Heuristic on the real source, not an AST — matches
 * this repo's own convention for this class of guard. */
function auditPlannerGridTitles(src) {
  const failures = [];
  for (const cls of TITLED_COL_CLASSES) {
    const needle = `className="${cls}"`;
    let from = 0;
    let found = false;
    for (;;) {
      const idx = src.indexOf(needle, from);
      if (idx < 0) break;
      found = true;
      // The opening tag starts at the nearest preceding "<div" and ends at the next ">" after idx.
      const tagStart = src.lastIndexOf("<div", idx);
      const tagEnd = src.indexOf(">", idx);
      const tag = src.slice(tagStart, tagEnd);
      if (!/title=/.test(tag)) {
        failures.push(`${PLANNER_GRID_FILE}: .${cls} renders with no title= — clips silently under the shared overflow:hidden rule`);
      }
      from = idx + needle.length;
    }
    if (!found) failures.push(`${PLANNER_GRID_FILE}: .${cls} className not found at all — fixture/guard out of sync with real source`);
  }
  return failures;
}

function run() {
  const dataBoardFiles = DATA_BOARD_FILES.map((relPath) => [relPath, read(relPath)]);
  const plannerGridSrc = read(PLANNER_GRID_FILE);

  const failures = [...auditDataBoardCaps(dataBoardFiles), ...auditPlannerGridTitles(plannerGridSrc)];

  if (failures.length > 0) {
    console.error("verify-page-autofit FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    `verify-page-autofit OK — ${DATA_BOARD_FILES.length} registered data-board page(s) carry no fixed max-w-[NNNpx] cap; PlannerGrid.tsx's sec/unit/status/action columns all pass title=.`
  );
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);

  // Baseline: both audits pass on the real, current source.
  const realDataBoardFiles = DATA_BOARD_FILES.map((relPath) => [relPath, read(relPath)]);
  const realPlannerGridSrc = read(PLANNER_GRID_FILE);
  assert.equal(auditDataBoardCaps(realDataBoardFiles).length, 0, "data-board cap audit should pass on real source");
  assert.equal(auditPlannerGridTitles(realPlannerGridSrc).length, 0, "planner-grid title audit should pass on real source");

  // MUTATION 1 — reintroduce the page-level cap on DispatchPlannersLayout.tsx.
  const layoutPath = DATA_BOARD_FILES[0];
  const layoutSrc = read(layoutPath);
  const wFullNeedle = 'data-testid="dispatch-planners-layout" className="w-full space-y-3"';
  assert.ok(layoutSrc.includes(wFullNeedle), "selftest fixture out of sync with the real layout file");
  const mutatedLayout = layoutSrc.replace(wFullNeedle, 'data-testid="dispatch-planners-layout" className="mx-auto max-w-[1400px] space-y-3"');
  assert.notEqual(mutatedLayout, layoutSrc, "mutation 1 did not change the source");
  const mutatedFiles1 = realDataBoardFiles.map(([p, s]) => (p === layoutPath ? [p, mutatedLayout] : [p, s]));
  assert.ok(auditDataBoardCaps(mutatedFiles1).length > 0, "MUTATION 1 (max-w-[1400px] reintroduced) escaped detection");

  // MUTATION 2 — drop title= from pg-col-sec.
  const secNeedle = '<div className="pg-col-sec" title={typeof row.secondary === "string" ? row.secondary : undefined}>';
  assert.ok(realPlannerGridSrc.includes(secNeedle), "selftest fixture out of sync with the real PlannerGrid.tsx");
  const mutatedGrid = realPlannerGridSrc.replace(secNeedle, '<div className="pg-col-sec">');
  assert.notEqual(mutatedGrid, realPlannerGridSrc, "mutation 2 did not change the source");
  assert.ok(auditPlannerGridTitles(mutatedGrid).length > 0, "MUTATION 2 (pg-col-sec title= dropped) escaped detection");

  console.log("verify-page-autofit --selftest PASS (2/2 mutations caught)");
  process.exit(0);
}

run();
