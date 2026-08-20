#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["load"],"leafRe":"^tab\\.violations$","task":"LINK-F5169-COMPLIANCE-LOAD"} */
/** @matrix-built {"modules":["docs"],"cols":["load"],"leafRe":"^(home|tab\\.all|upload|table\\.entity_link|docs\\.modal\\.upload)$","task":"LINK-F5169-DOCS-LOAD"} */
/** @matrix-built {"modules":["fuel"],"cols":["load"],"leafRe":"^(home|planner)$","task":"LINK-F5169-FUEL-LOAD"} */
/** @matrix-built {"modules":["home"],"cols":["load"],"leafRe":"^role\\.dispatcher$","task":"LINK-F5169-HOME-LOAD"} */
/** @matrix-built {"modules":["reports"],"cols":["load"],"leafRe":"^report\\.(lane_profitability|trip_profitability|dispatch_margin)$","task":"LINK-F5169-REPORTS-LOAD"} */
/** @matrix-built {"modules":["tasks"],"cols":["load"],"leafRe":"^(nav\\.(board|mine|calendar)|board\\.(planner_grid|create)|mine\\.list)$","task":"LINK-F5169-TASKS-LOAD"} */
/**
 * LINK-F5169 — vertical load-column guard across every remaining applicable all-28 leaf.
 * Applicability is deliberately narrow: only a row/create surface backed by a canonical load ID
 * earns load. Aggregate reports and navigation hops do not invent a record-level FK.
 *
 * Self-test: node scripts/verify-load-column-all-modules.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-column-all-modules";
const HOME_MATRIX = "docs/specs/scoreboard/modules/home.required.json";

const CHECKS = [
  // Compliance/Safety: existing FK now travels create → validation → INSERT → joined label → EntityLink.
  ["apps/backend/src/routes/safety/hos-violations.ts", /related_load_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/, "HOS create schema load FK"],
  ["apps/backend/src/routes/safety/hos-violations.ts", /l\.load_number AS related_load_number/, "HOS list human load label"],
  ["apps/backend/src/routes/safety/hos-violations.ts", /l\.operating_company_id = hv\.operating_company_id/, "HOS list company-scoped load join"],
  ["apps/backend/src/routes/safety/hos-violations.ts", /WHERE l\.id = \$5::uuid AND l\.operating_company_id = \$1::uuid/, "HOS create company ownership validation"],
  ["apps/backend/src/routes/safety/hos-violations.ts", /related_load_id,[\s\S]{0,180}VALUES \([\s\S]{0,100}\$8/, "HOS INSERT persists load FK"],
  ["apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", /kind="load"[\s\S]{0,100}value=\{form\.related_load_id \|\| null\}/, "HOS canonical load picker"],
  ["apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", /related_load_id: form\.related_load_id \|\| null/, "HOS submit payload load FK"],
  ["apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", /kind="load" id=\{row\.related_load_id as string \| undefined\}/, "HOS list load drill"],

  // Documents: standalone upload can key a file_link to an existing load; list resolves it back.
  ["apps/frontend/src/components/documents/UploadModal.tsx", /StandaloneLinkType = [^;]*"load"/, "Documents standalone load type"],
  ["apps/frontend/src/components/documents/UploadModal.tsx", /\{ value: "load", label: "Load" \}/, "Documents load choice"],
  ["apps/frontend/src/components/documents/UploadModal.tsx", /function standaloneLinkToPickerKind\(type: StandaloneLinkType\): EntityPickerKind \{\n  return type;\n\}/, "Documents canonical load picker"],
  ["apps/frontend/src/components/documents/UploadModal.tsx", /entity_links: \[\{ entity_type: resolvedEntityType, entity_id: resolvedEntityId \}\]/, "Documents persists file-to-load link"],
  [
    "apps/frontend/src/pages/docs/DocsHomePage.tsx",
    /function docsLinkToEntityKind\(entityType: FileEntityType\): EntityKind \| null \{[\s\S]{0,260}case "unit":\n\s*case "load":\n\s*case "settlement":[\s\S]{0,100}return entityType;/,
    "Documents load EntityLink map",
  ],

  // Tasks: creator writes task_link target_type=load; every record-bearing view resolves it.
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /\{ value: "unit", label: "Unit" \},\n\s*\{ value: "load", label: "Load" \}/, "Task load target choice"],
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /"vendor" \| "driver" \| "unit" \| "load"/, "Task canonical load picker"],
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /target_type: entityKind, target_id: entityId/, "Task submit preserves target FK"],
  ["apps/frontend/src/components/tasks/TaskSubjectLink.tsx", /load: "load"/, "Task load drill map"],
  ["apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx", /<TaskSubjectLink subjectType=\{task\.subject_type\} subjectId=\{task\.subject_id\}/, "Task board load drill"],
  ["apps/frontend/src/pages/tasks/TasksMinePage.tsx", /<TaskSubjectLink subjectType=\{row\.subject_type\} subjectId=\{row\.subject_id\}/, "My Tasks load drill"],
  ["apps/frontend/src/pages/tasks/TasksCalendarPage.tsx", /<TaskSubjectLink subjectType=\{t\.subject_type\} subjectId=\{t\.subject_id\}/, "Task calendar load drill"],

  // Existing genuine load-bearing operator/report surfaces are ratcheted rather than reimplemented.
  ["apps/frontend/src/pages/fuel/components/ActiveTripStrip.tsx", /kind="load"[\s\S]{0,80}id=\{route\?\.load_id/, "Fuel home active-trip load drill"],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", /searchParams\.get\("load_id"\)/, "Fuel planner reverse load route"],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /kind="load" id=\{row\.id\} label=\{entityLabel\(row\.load_number, row\.id, "Load"\)\}/, "Home active-load drill"],
  ["apps/frontend/src/pages/reports/DispatchMarginPage.tsx", /kind="load" id=\{row\.load_id\}/, "Dispatch-margin load drill"],
  ["apps/frontend/src/pages/dispatch/TripProfitability.tsx", /kind="load" id=\{row\.nb_load_id\}/, "Trip-profitability load drill"],
  ["apps/frontend/src/components/reports/LaneDetailModal.tsx", /kind="load" id=\{load\.load_id\}/, "Lane-profitability load drill"],
];

function readFiles(root) {
  const files = [...new Set([...CHECKS.map(([file]) => file), HOME_MATRIX])];
  return Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
}

export function audit(files) {
  const failures = CHECKS.flatMap(([file, pattern, description]) => pattern.test(files[file] ?? "") ? [] : [`${file}: ${description}`]);
  const home = JSON.parse(files[HOME_MATRIX] ?? '{"leaves":[]}');
  const owner = home.leaves?.find((leaf) => leaf.id === "role.owner");
  const dispatcher = home.leaves?.find((leaf) => leaf.id === "role.dispatcher");
  if (owner?.required?.includes("load")) failures.push(`${HOME_MATRIX}: role.owner invents load from DispatcherActiveLoadsPanel`);
  if (!dispatcher?.required?.includes("load")) failures.push(`${HOME_MATRIX}: role.dispatcher lost its genuine active-load contract`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = readFiles(ROOT);
  const baseline = audit(good);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — real tree rejected:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern, description] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(pattern, "PLANTED_LOAD_WIRING_DEFECT") };
    if (mutated[file] === good[file] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${description}`);
      process.exit(1);
    }
    caught++;
  }
  const crossLeaf = structuredClone(good);
  crossLeaf[HOME_MATRIX] = crossLeaf[HOME_MATRIX].replace(
    '"required": [\n        "connectivity",\n        "driver"',
    '"required": [\n        "connectivity",\n        "load",\n        "driver"',
  );
  if (crossLeaf[HOME_MATRIX] === good[HOME_MATRIX] || !audit(crossLeaf).some((failure) => failure.includes("role.owner invents load"))) {
    console.error(`${LABEL} SELFTEST FAIL — Owner/Dispatcher cross-leaf load mutation escaped`);
    process.exit(1);
  }
  caught++;
  console.log(`${LABEL} SELFTEST PASS — ${caught} planted load-wiring defects detected`);
  process.exit(0);
}

const failures = audit(readFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all remaining genuine load leaves preserve canonical company-scoped IDs and human drill-through`);
