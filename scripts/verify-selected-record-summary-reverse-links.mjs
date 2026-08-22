#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch"],"cols":["driver","unit","load","connectivity","reverse_link"],"leaves":["home.kanban"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}
 * @matrix-built {"modules":["insurance"],"cols":["connectivity","reverse_link"],"leaves":["policies.list"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}
 * @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["pm.auto_engine.run"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}
 * @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link"],"leaves":["pm.schedule.list"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}
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
  dispatchMatrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  insuranceMatrix: "docs/specs/scoreboard/modules/insurance.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-selected-record-summary-reverse-links.mjs",
};
const HEADERS = [
  ' * @matrix-built {"modules":["dispatch"],"cols":["driver","unit","load","connectivity","reverse_link"],"leaves":["home.kanban"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}',
  ' * @matrix-built {"modules":["insurance"],"cols":["connectivity","reverse_link"],"leaves":["policies.list"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}',
  ' * @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["pm.auto_engine.run"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}',
  ' * @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link"],"leaves":["pm.schedule.list"],"task":"CLASS-F5888-SELECTED-RECORD-REVERSE-EXACT","vertical":"class-sweep"}',
];

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

  const required = [
    ["dispatchMatrix", "home.kanban", ["driver", "unit", "load", "connectivity", "reverse_link"], "/dispatch?view=kanban"],
    ["insuranceMatrix", "policies.list", ["connectivity", "reverse_link"], "/safety/insurance/policies"],
    ["maintenanceMatrix", "pm.auto_engine.run", ["connectivity"], "/maintenance/pm-auto-engine"],
    ["maintenanceMatrix", "pm.schedule.list", ["connectivity", "reverse_link"], "/maintenance/pm-schedule?schedule_id="],
  ];
  for (const [key, id, cols, route] of required) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    for (const col of cols) if (!leaf?.required?.includes(col)) failures.push(`${id} must require ${col}`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  const annotationBlock = source.self.split('import fs from "node:fs";')[0];
  for (const header of HEADERS) if (!annotationBlock.includes(header)) failures.push(`missing exact matrix header: ${header}`);
  try {
    const feed = JSON.parse(source.feed);
    if (feed.entries?.some((entry) => entry.guard === FILES.self)) failures.push("manual feed must not duplicate exact in-guard ownership");
  } catch (error) { failures.push(`wire sprint feed must parse: ${error.message}`); }
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
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    const mutated = { ...source, [key]: source[key].replaceAll(before, after) };
    if (verify(mutated).length === 0) throw new Error(`self-test mutation survived: ${key} ${before}`);
  }
  const matrixMutations = [
    ["dispatchMatrix", "home.kanban", ["driver", "unit", "load", "connectivity", "reverse_link"]],
    ["insuranceMatrix", "policies.list", ["connectivity", "reverse_link"]],
    ["maintenanceMatrix", "pm.auto_engine.run", ["connectivity"]],
    ["maintenanceMatrix", "pm.schedule.list", ["connectivity", "reverse_link"]],
  ];
  for (const [key, id, cols] of matrixMutations) {
    const original = source[key];
    const idToken = `"id": "${id}"`;
    if (!verify({ ...source, [key]: original.replace(idToken, `"id": "${id}.broken"`) }).length) throw new Error(`matrix id mutation survived: ${id}`);
    const leafStart = original.indexOf(idToken);
    const nextLeaf = original.indexOf('\n    {', leafStart + idToken.length);
    const leafBlock = original.slice(leafStart, nextLeaf < 0 ? original.length : nextLeaf);
    for (const col of cols) {
      const token = `"${col}"`;
      if (!leafBlock.includes(token)) throw new Error(`matrix fixture missing: ${id}:${col}`);
      const changedBlock = leafBlock.replace(token, `"${col}.broken"`);
      const changed = original.slice(0, leafStart) + changedBlock + original.slice(nextLeaf < 0 ? original.length : nextLeaf);
      if (!verify({ ...source, [key]: changed }).length) throw new Error(`matrix column mutation survived: ${id}:${col}`);
    }
  }
  for (const header of HEADERS) {
    const broken = header.replace('"vertical":"class-sweep"', '"vertical":"broken"');
    if (!verify({ ...source, self: source.self.replace(header, broken) }).length) throw new Error("header mutation survived");
  }
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ guard: FILES.self, modules: ["maintenance"], cols: ["reverse_link"], leafRe: ".*" });
  if (!verify({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log("PASS: 31 planted defects were rejected");
}

console.log("PASS: selected-record summaries expose canonical reverse-link drill-through across Dispatch, Insurance, and Maintenance");
