#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["teams.create"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["fleet.modal.create_trailer","fleet.modal.create_unit","fleet.modal.edit_trailer"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["insurance"],"cols":["connectivity"],"leaves":["type_catalog.create"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["legal"],"cols":["connectivity"],"leaves":["contracts.create"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["lists.drawer.catalog_quick_create","lists.drawer.inline_create","lists.modal.quick_create_entity","catalogs.equipment_types.create","catalogs.driver_load_statuses.create"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["inspections.create","fault_rules.create","master.drivers.create","master.vehicles.create"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["tasks"],"cols":["connectivity"],"leaves":["board.create","tasks.modal.create_task","daily_tasks.create"],"task":"CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const EXPECTED = {
  drivers: ["teams.create"],
  fleet: ["fleet.modal.create_trailer", "fleet.modal.create_unit", "fleet.modal.edit_trailer"],
  insurance: ["type_catalog.create"],
  legal: ["contracts.create"],
  lists: ["lists.drawer.catalog_quick_create", "lists.drawer.inline_create", "lists.modal.quick_create_entity", "catalogs.equipment_types.create", "catalogs.driver_load_statuses.create"],
  maintenance: ["inspections.create", "fault_rules.create", "master.drivers.create", "master.vehicles.create"],
  tasks: ["board.create", "tasks.modal.create_task", "daily_tasks.create"],
};

const EXACT_HEADERS = Object.entries(EXPECTED).map(([moduleId, leaves]) =>
  `/** @matrix-built ${JSON.stringify({ modules: [moduleId], cols: ["connectivity"], leaves, task: "CLASS-F5955-NONMONEY-CREATOR-CONNECTIVITY-EXACT", vertical: "class-sweep" })} */`,
);

const GUARDS = [
  "verify-driver-column-all-module-remainder.mjs",
  "verify-fleet-unit-roster-modals.mjs",
  "verify-fleet-roster-create-actions.mjs",
  "verify-fleet-edit-save-wired.mjs",
  "verify-insurance-type-catalog-create-vocab.mjs",
  "verify-driver-column-remaining-modules.mjs",
  "verify-inline-create-writes-canonical.mjs",
  "verify-surface-bar-create-drawer-inventory.mjs",
  "verify-equipment-types-per-entity.mjs",
  "verify-lists-hub-driver-load-statuses.mjs",
  "verify-fault-auto-wo-rls.mjs",
  "verify-create-task-modal-pickers.mjs",
  "verify-tasks-unit-wiring.mjs",
  "verify-daily-tasks-uses-paritytable.mjs",
];

export function auditMatrices(readFile = (file) => fs.readFileSync(file, "utf8")) {
  const failures = [];
  for (const [moduleId, ids] of Object.entries(EXPECTED)) {
    let matrix;
    try { matrix = JSON.parse(readFile(`docs/specs/scoreboard/modules/${moduleId}.required.json`)); }
    catch { failures.push(`${moduleId} matrix must remain valid JSON`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf) failures.push(`${moduleId}:${id} must remain an inventoried exact leaf`);
      else if (!leaf.required?.includes("connectivity")) failures.push(`${moduleId}:${id} must retain connectivity Required while the real creator exists`);
    }
  }
  return failures;
}

export function auditExactHeaders(source = fs.readFileSync("scripts/verify-connectivity-nonmoney-create-remainder.mjs", "utf8")) {
  return EXACT_HEADERS.filter((header) => !source.split("\n").includes(header)).map((header) => `missing exact Built header: ${header}`);
}

const failures = [...auditMatrices(), ...auditExactHeaders()];
if (failures.length) {
  console.error(`verify-connectivity-nonmoney-create-remainder FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

for (const guard of GUARDS) {
  try {
    execFileSync(process.execPath, [`scripts/${guard}`, ...(process.argv.includes("--selftest") ? ["--selftest"] : [])], { stdio: "pipe" });
  } catch (error) {
    const detail = String(error?.stdout ?? "") + String(error?.stderr ?? "");
    console.error(`verify-connectivity-nonmoney-create-remainder FAIL — ${guard}\n${detail}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [moduleId, ids] of Object.entries(EXPECTED)) {
    const file = `docs/specs/scoreboard/modules/${moduleId}.required.json`;
    const original = fs.readFileSync(file, "utf8");
    for (const id of ids) {
      const parsed = JSON.parse(original);
      parsed.leaves.find((leaf) => leaf.id === id).required = parsed.leaves.find((leaf) => leaf.id === id).required.filter((col) => col !== "connectivity");
      const readMutant = (candidate) => candidate === file ? JSON.stringify(parsed) : fs.readFileSync(candidate, "utf8");
      if (!auditMatrices(readMutant).length) throw new Error(`selftest matrix mutation survived: ${moduleId}:${id}`);
      caught++;
    }
  }
  const source = fs.readFileSync("scripts/verify-connectivity-nonmoney-create-remainder.mjs", "utf8");
  for (const header of EXACT_HEADERS) {
    if (!auditExactHeaders(source.replace(header, `${header}.broken`)).length) throw new Error(`selftest exact header mutation survived: ${header}`);
    caught++;
  }
  console.log(`verify-connectivity-nonmoney-create-remainder SELFTEST PASS — ${caught} exact matrix/header mutations plus ${GUARDS.length} child selftests rejected defects`);
}
console.log(`verify-connectivity-nonmoney-create-remainder PASS — ${Object.values(EXPECTED).flat().length} exact creators retain mounted, scoped, canonical write/reload evidence`);
