#!/usr/bin/env node
/**
 * InlineUnitPicker — EntityPicker kind=unit reads mdata.units with server search.
 * Dispatch board/list inline assign must use the canonical picker (parity with InlineDriver/Trailer).
 * Cursor even claim: 2418.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inline-unit-picker-entity-picker";

const SURFACES = ["apps/frontend/src/components/dispatch/InlineUnitPicker.tsx"];

const REGISTRY = "apps/frontend/src/components/parity/entityPickerRegistry.ts";
const PICKER = "apps/frontend/src/components/parity/EntityPicker.tsx";
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
    if (!/\bunit:\s*\{/.test(regCode)) {
      problems.push(`${REGISTRY}: must declare unit kind`);
    }
    if (!/readTable:\s*"mdata\.units"/.test(regCode) || !/writeTable:\s*"mdata\.units"/.test(regCode)) {
      problems.push(`${REGISTRY}: unit kind must read/write mdata.units`);
    }
    const unitSlice = regCode.split("unit:")[1]?.split("\n  load:")[0] ?? "";
    if (!/listUnits\(/.test(unitSlice)) {
      problems.push(`${REGISTRY}: unit list must call listUnits (GET /api/v1/mdata/units)`);
    }
    if (!/serverSearch:\s*true/.test(unitSlice)) {
      problems.push(`${REGISTRY}: unit kind must declare serverSearch: true`);
    }
  }

  const api = readRel(root, MDATA_API);
  if (!api || !/export function listUnits/.test(api)) {
    problems.push(`${MDATA_API}: must export listUnits for unit roster`);
  }

  const picker = readRel(root, PICKER);
  if (!picker || !/kind === "unit"/.test(picker)) {
    problems.push(`${PICKER}: must wire kind=unit`);
  }

  for (const rel of SURFACES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
      problems.push(`${rel}: unit field must use EntityPicker kind=unit`);
    }
    if (/listUnits\s*\(/.test(code) || /limit:\s*200/.test(code) || /limit:\s*500/.test(code)) {
      problems.push(`${rel}: must not use listUnits silent cap — use EntityPicker kind=unit`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-inline-unit-ep-"));
  try {
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, "entityPickerRegistry.ts"),
      `export type EntityPickerKind = "driver";
const ENTITY_PICKERS = { driver: { readTable: "mdata.drivers", writeTable: "mdata.drivers", serverSearch: true, list: async () => [] } };
export function getEntityPickerConfig() { return ENTITY_PICKERS.driver; }`,
    );
    fs.writeFileSync(path.join(regDir, "EntityPicker.tsx"), `export function EntityPicker() { return null; }`);
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/api"), { recursive: true });
    fs.writeFileSync(path.join(stubRoot, "apps/frontend/src/api/mdata.ts"), `export function listUnits() {}`);
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/dispatch"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx"),
      `listUnits({ limit: 200 })
<Combobox options={options} onSearch={setUnitSearch} />`,
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker kind=unit/.test(p) || /unit kind/.test(p) || /listUnits/.test(p))) {
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
  console.log(`${LABEL} OK — InlineUnitPicker EntityPicker kind=unit → mdata.units`);
}
