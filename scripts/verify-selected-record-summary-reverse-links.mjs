#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch","insurance","maintenance"],"cols":["driver","unit","load","policy","connectivity","reverse_link"],"leafRe":"^(home\\.kanban|policies\\.list|pm\\.auto_engine\\.run|pm\\.schedule\\.list)$","task":"LINK-F5135-SELECTED-RECORD-SUMMARY-REVERSE-LINKS","vertical":"class-sweep"}
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FILES = {
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
  kanban: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  policies: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  pmAuto: "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx",
  matrix: "docs/specs/scoreboard/modules/maintenance.required.json",
};

function readFiles() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

function verify(source) {
  const failures = [];
  const requireText = (key, needle, message) => {
    if (!source[key].includes(needle)) failures.push(message);
  };

  requireText("resolver", '| "pm_schedule"', "EntityKind must include pm_schedule");
  requireText("resolver", 'case "pm_schedule":', "EntityLink must resolve pm_schedule");
  requireText("resolver", 'return `/maintenance/pm-schedule?schedule_id=${id}`;', "pm_schedule must use the mounted schedule_id route");
  requireText("kanban", 'data-testid="kanban-card-primary-entity-link"', "detailed Kanban card primary identity must drill through");
  requireText("kanban", 'data-testid="kanban-standard-primary-entity-link"', "standard Kanban card primary identity must drill through");
  requireText("kanban", 'id={load.assigned_unit_id}', "Kanban assigned-unit primary identity must use the canonical unit id");
  requireText("kanban", '<EntityLink kind="load" id={load.id}', "Kanban unassigned primary identity must use the canonical load id");
  requireText("kanban", 'data-testid="kanban-standard-driver-link"', "standard Kanban driver identity must drill through");
  requireText("policies", '<EntityLink kind="insurance_policy" id={p.id}', "policy roster identity must drill through by canonical policy id");
  requireText("pmAuto", 'kind="pm_schedule"', "PM action log schedule identity must drill through");
  requireText("pmAuto", 'id={entry.pm_schedule_id}', "PM action log must use the canonical schedule id");

  let matrix;
  try {
    matrix = JSON.parse(source.matrix);
  } catch (error) {
    failures.push(`maintenance matrix must parse: ${error.message}`);
  }
  const leaf = matrix?.leaves?.find((candidate) => candidate.id === "pm.schedule.list");
  if (!leaf) failures.push("maintenance matrix must inventory pm.schedule.list");
  if (!leaf?.required?.includes("reverse_link")) failures.push("pm.schedule.list must require reverse_link");
  if (leaf?.route_hint !== "/maintenance/pm-schedule?schedule_id=") failures.push("pm.schedule.list must name the mounted selected-record route");
  return failures;
}

const source = readFiles();
const failures = verify(source);
if (failures.length) {
  console.error("selected-record summary reverse-link guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  const mutations = [
    ["resolver", '| "pm_schedule"', '| "pm_schedule_broken"'],
    ["resolver", 'case "pm_schedule":', 'case "pm_schedule_broken":'],
    ["kanban", 'data-testid="kanban-card-primary-entity-link"', 'data-testid="broken-card-primary"'],
    ["kanban", 'data-testid="kanban-standard-primary-entity-link"', 'data-testid="broken-standard-primary"'],
    ["kanban", 'id={load.assigned_unit_id}', 'id={undefined}'],
    ["kanban", '<EntityLink kind="load" id={load.id}', '<EntityLink kind="load" id={undefined}'],
    ["kanban", 'data-testid="kanban-standard-driver-link"', 'data-testid="broken-driver"'],
    ["policies", '<EntityLink kind="insurance_policy" id={p.id}', '<EntityLink kind="customer" id={p.id}'],
    ["pmAuto", 'kind="pm_schedule"', 'kind="work_order"'],
    ["matrix", '"id": "pm.schedule.list"', '"id": "pm.schedule.list.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    const mutated = { ...source, [key]: source[key].replaceAll(before, after) };
    if (verify(mutated).length === 0) throw new Error(`self-test mutation survived: ${key} ${before}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}

console.log("PASS: selected-record summaries expose canonical reverse-link drill-through across Dispatch, Insurance, and Maintenance");
