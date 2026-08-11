#!/usr/bin/env node
/**
 * Book Load equipment — truck EntityPicker + trailer Combobox server search (no silent 500-cap SelectCombobox).
 * Cursor even claim: 2100.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bookload-equipment-entitypicker-search";
const FILE = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";
const MODAL_FILE = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const BOOK_LOAD_SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const TRIP_PAIRING_FILE = "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx";
const TIMELINE_FILE = "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code) || !/assigned_unit_id/.test(code)) {
    problems.push(`${FILE}: truck unit must use EntityPicker kind=unit`);
  }
  if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(code) || !/assigned_trailer_unit_id/.test(code)) {
    problems.push(`${FILE}: trailer unit must use EntityPicker kind=trailer`);
  }
  if (/include:\s*["']trailers["']/.test(code)) {
    problems.push(`${FILE}: must not use listUnits(include:trailers) — EntityPicker kind=trailer reads mdata.equipment`);
  }
  if (/SelectCombobox[\s\S]{0,200}assigned_unit_id/.test(code) || /SelectCombobox[\s\S]{0,120}trucks\.map/.test(code)) {
    problems.push(`${FILE}: must not keep SelectCombobox dual path for truck unit`);
  }
  if (/SelectCombobox[\s\S]{0,200}assigned_trailer_unit_id/.test(code) || /SelectCombobox[\s\S]{0,120}trailers\.map/.test(code)) {
    problems.push(`${FILE}: must not keep SelectCombobox dual path for trailer unit`);
  }

  // FAIL-CA1: newly created drivers default to Probation — Active-only hid them on Book Load.
  if (!/driverRoster=["']active_or_probation["']/.test(code)) {
    problems.push(`${FILE}: FAIL-CA1 — DriverPickerWithCreate must pass driverRoster="active_or_probation"`);
  }

  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet page`);
  }

  const modal = readRel(root, MODAL_FILE) ?? "";
  if (!/prefillDriverId\?:\s*string\s*\|\s*null/.test(modal)) {
    problems.push(`${MODAL_FILE}: awaiting-unit entry points must be able to prefill the canonical driver FK`);
  }
  if (!/assigned_primary_driver_id:\s*prefillDriverId\s*\?\?\s*["']{2}/.test(modal)) {
    problems.push(`${MODAL_FILE}: prefillDriverId must initialize assigned_primary_driver_id in form defaults`);
  }
  for (const [field, label] of [
    ["customer_id", "customer"],
    ["assigned_unit_id", "unit"],
    ["assigned_trailer_unit_id", "trailer"],
  ]) {
    if (!new RegExp(`${field}:\\s*values\\.${field}`).test(modal)) {
      problems.push(`${MODAL_FILE}: submit payload must carry the canonical ${label} FK (${field})`);
    }
  }
  if (!/assigned_primary_driver_id:\s*values\.assignment_mode\s*===\s*["']solo["'][\s\S]{0,120}?values\.assigned_primary_driver_id/.test(modal)) {
    problems.push(`${MODAL_FILE}: submit payload must carry the canonical driver FK (assigned_primary_driver_id)`);
  }

  const service = readRel(root, BOOK_LOAD_SERVICE) ?? "";
  if (!/INSERT INTO mdata\.loads[\s\S]*?customer_id[\s\S]*?assigned_unit_id[\s\S]*?assigned_primary_driver_id/.test(service)) {
    problems.push(`${BOOK_LOAD_SERVICE}: mdata.loads INSERT must persist customer, unit, and primary-driver FKs`);
  }
  if (!/input\.customer_id[\s\S]*?input\.assigned_unit_id\s*\?\?\s*null[\s\S]*?input\.team_id\s*\?\s*null\s*:\s*\(input\.assigned_primary_driver_id/.test(service)) {
    problems.push(`${BOOK_LOAD_SERVICE}: INSERT values must bind customer_id, assigned_unit_id, and assigned_primary_driver_id`);
  }
  if (!/INSERT INTO dispatch\.load_assignment_history[\s\S]*?new_trailer_id[\s\S]*?trailerIdForInsert/.test(service)) {
    problems.push(
      `${BOOK_LOAD_SERVICE}: selected trailer must persist to dispatch.load_assignment_history.new_trailer_id ` +
        `(mdata.loads has no trailer column)`
    );
  }
  for (const entryFile of [TRIP_PAIRING_FILE, TIMELINE_FILE]) {
    const entry = readRel(root, entryFile) ?? "";
    if (!/prefillDriverId=\{/.test(entry)) {
      problems.push(`${entryFile}: BookLoadModalV4 must receive the awaiting unit's driver FK`);
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const realModal = readRel(ROOT, MODAL_FILE);
  const realService = readRel(ROOT, BOOK_LOAD_SERVICE);
  if (!realModal || !realService) {
    console.error(`${LABEL} SELFTEST FAIL: missing real modal/service sources`);
    process.exit(1);
  }
  const fkMutations = [
    [MODAL_FILE, realModal, /customer_id:\s*values\.customer_id/, "customer_id: undefined", "customer FK"],
    [MODAL_FILE, realModal, /assigned_unit_id:\s*values\.assigned_unit_id\s*\|\|\s*undefined/, "assigned_unit_id: undefined", "unit FK"],
    [MODAL_FILE, realModal, /assigned_primary_driver_id:\s*values\.assignment_mode[\s\S]*?undefined,/, "assigned_primary_driver_id: undefined,", "driver FK"],
    [MODAL_FILE, realModal, /assigned_trailer_unit_id:\s*values\.assigned_trailer_unit_id\s*\|\|\s*undefined/, "assigned_trailer_unit_id: undefined", "trailer FK"],
    [BOOK_LOAD_SERVICE, realService, /new_trailer_id,/, "removed_trailer_column,", "trailer sink"],
  ];
  for (const [rel, original, pattern, replacement, label] of fkMutations) {
    const mutated = original.replace(pattern, replacement);
    if (mutated === original) {
      console.error(`${LABEL} SELFTEST FAIL: ${label} mutation was inert`);
      process.exit(1);
    }
    const mutationRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bookload-fk-"));
    try {
      for (const sourceRel of [FILE, MODAL_FILE, BOOK_LOAD_SERVICE, TRIP_PAIRING_FILE, TIMELINE_FILE]) {
        const target = path.join(mutationRoot, sourceRel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, sourceRel === rel ? mutated : readRel(ROOT, sourceRel));
      }
      if (!collectProblems(mutationRoot).some((p) => p.includes(label.split(" ")[0]))) {
        console.error(`${LABEL} SELFTEST FAIL: ${label} mutation was not detected`);
        process.exit(1);
      }
    } finally {
      fs.rmSync(mutationRoot, { recursive: true, force: true });
    }
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bookload-equip-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/dispatch/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BookLoadEquipmentSection.tsx"),
      `export function BookLoadEquipmentSection() {
  const unitsQuery = useQuery({ queryFn: () => listUnits({ limit: 500 }) });
  return (
    <>
      <SelectCombobox {...register("assigned_unit_id")}>{trucks.map((u) => <option key={u.id}>{u.label}</option>)}</SelectCombobox>
      <SelectCombobox {...register("assigned_trailer_unit_id")}>{trailers.map((u) => <option key={u.id}>{u.label}</option>)}</SelectCombobox>
    </>
  );
}
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted SelectCombobox stub did not FAIL EntityPicker`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — BookLoad equipment truck EntityPicker + trailer search`);
}
