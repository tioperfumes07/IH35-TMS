#!/usr/bin/env node
/**
 * Dispatch trailer pickers — EntityPicker kind=trailer reads mdata.equipment (not listUnits include:trailers).
 * Trailers live in mdata.equipment; kind=unit deliberately excludes them. QuickAssign, Book Load, and
 * InlineTrailerPicker must use the canonical picker so FKs match dispatch.load_assignment_history.new_trailer_id.
 * Cursor even claim: 2378.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-trailer-entity-picker";

const SURFACES = [
  "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
  "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx",
];

const REGISTRY = "apps/frontend/src/components/parity/entityPickerRegistry.ts";
const PICKER = "apps/frontend/src/components/EntityPicker.tsx";
const MDATA_API = "apps/frontend/src/api/mdata.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const registry = readRel(root, REGISTRY);
  if (!registry) {
    problems.push(`missing ${REGISTRY}`);
  } else {
    const regCode = registry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/\btrailer:\s*\{/.test(regCode)) {
      problems.push(`${REGISTRY}: must declare trailer kind`);
    }
    if (!/readTable:\s*"mdata\.equipment"/.test(regCode) || !/writeTable:\s*"mdata\.equipment"/.test(regCode)) {
      problems.push(`${REGISTRY}: trailer kind must read/write mdata.equipment`);
    }
    if (!/listEquipment\(/.test(regCode)) {
      problems.push(`${REGISTRY}: trailer list must call listEquipment (GET /api/v1/mdata/equipment)`);
    }
    if (!/serverSearch:\s*true/.test(regCode.split("trailer:")[1]?.split("\n  load:")[0] ?? "")) {
      problems.push(`${REGISTRY}: trailer kind must declare serverSearch: true`);
    }
  }

  const api = readRel(root, MDATA_API);
  if (!api || !/export function listEquipment/.test(api)) {
    problems.push(`${MDATA_API}: must export listEquipment for trailer roster`);
  }

  const picker = readRel(root, PICKER);
  if (!picker || !/CreateTrailerModal/.test(picker) || !/kind === "trailer"/.test(picker)) {
    problems.push(`${PICKER}: must wire CreateTrailerModal for kind=trailer inline create`);
  }

  for (const rel of SURFACES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(code)) {
      problems.push(`${rel}: trailer field must use EntityPicker kind=trailer`);
    }
    if (/include:\s*["']trailers["']/.test(code) || /equipment_kind\s*===\s*["']trailer["']/.test(code)) {
      problems.push(`${rel}: must not use listUnits(include:trailers) shim — use EntityPicker kind=trailer`);
    }
    if (/limit:\s*500/.test(code)) {
      problems.push(`${rel}: must not silent-fetch limit:500 fleet page`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-disp-trailer-ep-"));
  try {
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, "entityPickerRegistry.ts"),
      `export type EntityPickerKind = "unit";
const ENTITY_PICKERS = { unit: { readTable: "mdata.units", writeTable: "mdata.units", serverSearch: true, list: async () => [] } };
export function getEntityPickerConfig() { return ENTITY_PICKERS.unit; }`
    );
    fs.writeFileSync(path.join(regDir, "EntityPicker.tsx"), `export function EntityPicker() { return null; }`);
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/api"), { recursive: true });
    fs.writeFileSync(path.join(stubRoot, "apps/frontend/src/api/mdata.ts"), `export function listEquipment() {}`);
    const qaDir = path.join(stubRoot, "apps/frontend/src/pages/dispatch/components");
    fs.mkdirSync(qaDir, { recursive: true });
    fs.writeFileSync(
      path.join(qaDir, "QuickAssignModal.tsx"),
      `listUnits({ include: "trailers", limit: 500 })
<Combobox options={trailerOptions} onSearch={setTrailerSearch} />`
    );
    fs.writeFileSync(
      path.join(qaDir, "BookLoadEquipmentSection.tsx"),
      `listUnits({ include: "trailers" })`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/dispatch"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx"),
      `listUnits({ limit: 500, include: "trailers" })`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker kind=trailer/.test(p) || /trailer kind/.test(p) || /listUnits/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
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
  console.log(`${LABEL} OK — dispatch trailer EntityPicker kind=trailer → mdata.equipment`);
}
