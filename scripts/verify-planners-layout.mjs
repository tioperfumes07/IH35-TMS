#!/usr/bin/env node
/**
 * ROUND 20.6 DISPATCH PLANNERS (Claude Lead, owner-live 2026-09-12, 17:45-17:55 CT audit).
 *
 * SCOPE FENCE (owner 2026-09-12: "do not work on anything related to loads, cursor is doing
 * that"): this guard covers LABELS/COLUMNS only -- title attributes on clipping cells (S3/L3) and
 * no raw snake_case status enum shown to the user (L1). The Lead's own spec for this guard ALSO
 * named a fixed max-w page-level cap check -- that check is intentionally NOT included here: the
 * cap (DispatchPlannersLayout.tsx / PlannerCalendarPage.tsx) is explicitly CC-2's ROUND 20.7
 * (APP-WIDE AUTOFIT LAW), which ships its own guard (verify-page-autofit.mjs) wired into the money
 * gate. Duplicating that check here, before ROUND 20.7 lands, would ship a guard this seat cannot
 * keep green without touching another seat's in-flight file -- exactly the two-owners-one-file
 * collision the fast-merge law exists to avoid. Once ROUND 20.7 lands, extend THIS guard (or defer
 * permanently to verify-page-autofit.mjs) rather than re-adding a second max-w check.
 *
 * Self-testing static guard. Run: node scripts/verify-planners-layout.mjs [--selftest]
 */
import fs from "node:fs";

const PLANNER_GRID_FILE = "apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx";
const LOADS_PLANNER_FILE = "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx";

const files = [PLANNER_GRID_FILE, LOADS_PLANNER_FILE];
const original = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

const checks = [
  [
    "pg-col-name carries a title attribute (S3/L3)",
    (sources) => /className="pg-col-name"\s+title=\{/.test(sources.get(PLANNER_GRID_FILE) ?? ""),
    (sources) => {
      const s = sources.get(PLANNER_GRID_FILE) ?? "";
      sources.set(
        PLANNER_GRID_FILE,
        s.replace('className="pg-col-name" title={typeof row.name === "string" ? row.name : undefined}', 'className="pg-col-name"')
      );
    },
  ],
  [
    "pg-col-sec carries a title attribute (S3/L3)",
    (sources) => /className="pg-col-sec" title=\{/.test(sources.get(PLANNER_GRID_FILE) ?? ""),
    (sources) => {
      const s = sources.get(PLANNER_GRID_FILE) ?? "";
      sources.set(
        PLANNER_GRID_FILE,
        s.replace('className="pg-col-sec" title={typeof row.secondary === "string" ? row.secondary : undefined}', 'className="pg-col-sec"')
      );
    },
  ],
  [
    "Loads Planner routes status through STATUS_LABEL, not a raw enum (L1)",
    (sources) => {
      const s = sources.get(LOADS_PLANNER_FILE) ?? "";
      // Must import STATUS_LABEL AND never assign a bare `load.status` straight to a status field
      // (both the list-view and grid-view status fields must go through the map).
      if (!/import \{ STATUS_LABEL \} from "\.\.\/\.\.\/\.\.\/components\/dispatch\/constants";/.test(s)) return false;
      if (/status:\s*load\.status,/.test(s)) return false;
      return /STATUS_LABEL\[load\.status as keyof typeof STATUS_LABEL\] \?\? load\.status/.test(s);
    },
    (sources) => {
      const s = sources.get(LOADS_PLANNER_FILE) ?? "";
      sources.set(
        LOADS_PLANNER_FILE,
        s.replaceAll("STATUS_LABEL[load.status as keyof typeof STATUS_LABEL] ?? load.status", "load.status")
      );
    },
  ],
];

function audit(sources) {
  return checks.filter(([, test]) => !test(sources)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-planners-layout FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of checks) {
    const mutated = new Map(original);
    mutate(mutated);
    let changed = false;
    for (const file of files) {
      if (mutated.get(file) !== original.get(file)) changed = true;
    }
    if (!changed) throw new Error(`selftest mutate() was a no-op for: ${name}`);
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-planners-layout SELFTEST PASS — ${caught}/${checks.length} mutations detected`);
  process.exit(0);
}

console.log("verify-planners-layout PASS — pg-col-name/pg-col-sec carry title attributes, Loads Planner status routes through STATUS_LABEL");
