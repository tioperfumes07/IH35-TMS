#!/usr/bin/env node
/**
 * InlineDriverPicker — EntityPicker kind=driver reads mdata.drivers with server search.
 * Dispatch board/list inline assign must use the canonical picker so FKs match load_assignment_history.
 * Cursor even claim: 2416.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inline-driver-picker-entity-picker";

const SURFACES = ["apps/frontend/src/components/dispatch/InlineDriverPicker.tsx"];

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
    if (!/\bdriver:\s*\{/.test(regCode)) {
      problems.push(`${REGISTRY}: must declare driver kind`);
    }
    if (!/readTable:\s*"mdata\.drivers"/.test(regCode) || !/writeTable:\s*"mdata\.drivers"/.test(regCode)) {
      problems.push(`${REGISTRY}: driver kind must read/write mdata.drivers`);
    }
    if (!/listDrivers\(/.test(regCode.split("driver:")[1]?.split("\n  unit:")[0] ?? regCode)) {
      problems.push(`${REGISTRY}: driver list must call listDrivers (GET /api/v1/mdata/drivers)`);
    }
    if (!/serverSearch:\s*true/.test(regCode.split("driver:")[1]?.split("\n  unit:")[0] ?? "")) {
      problems.push(`${REGISTRY}: driver kind must declare serverSearch: true`);
    }
  }

  const api = readRel(root, MDATA_API);
  if (!api || !/export function listDrivers/.test(api)) {
    problems.push(`${MDATA_API}: must export listDrivers for driver roster`);
  }

  const picker = readRel(root, PICKER);
  if (!picker || !/CreateDriverModal/.test(picker) || !/kind === "driver"/.test(picker)) {
    problems.push(`${PICKER}: must wire CreateDriverModal for kind=driver inline create`);
  }

  for (const rel of SURFACES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/EntityPicker[\s\S]*?kind=["']driver["']/.test(code)) {
      problems.push(`${rel}: driver field must use EntityPicker kind=driver`);
    }
    if (/listDrivers\s*\(/.test(code) || /limit:\s*200/.test(code) || /limit:\s*500/.test(code)) {
      problems.push(`${rel}: must not use listDrivers silent cap — use EntityPicker kind=driver`);
    }
    if (/CreateDriverModal/.test(code)) {
      problems.push(`${rel}: inline create must be owned by EntityPicker, not a duplicate CreateDriverModal`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-inline-drv-ep-"));
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
    fs.writeFileSync(path.join(stubRoot, "apps/frontend/src/api/mdata.ts"), `export function listDrivers() {}`);
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/dispatch"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx"),
      `listDrivers({ limit: 200, status: "Active" })
<Combobox options={driverOptions} onSearch={setDriverSearch} />
<CreateDriverModal open={driverCreateOpen} />`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker kind=driver/.test(p) || /driver kind/.test(p) || /listDrivers/.test(p))) {
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
  console.log(`${LABEL} OK — InlineDriverPicker EntityPicker kind=driver → mdata.drivers`);
}
