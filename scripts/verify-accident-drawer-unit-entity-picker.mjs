#!/usr/bin/env node
/**
 * AccidentReportDrawer — Unit/Load/Vendor use EntityPicker (server search + optional create),
 * not silent Combobox over listUnits/listDispatchLoads or capped listVendors.
 * Cursor even claim: 2142.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accident-drawer-unit-entity-picker";
const FILE = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const ENTITY_PICKER = "apps/frontend/src/components/parity/EntityPicker.tsx";

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
  if (!/EntityPicker/.test(code) || !/kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind="unit"`);
  }
  if (!/kind=["']load["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind="load"`);
  }
  // P14 Box4 — accidents.create owes picker_law: Load must offer + Add new (never filter-mode).
  if (/kind=["']load["'][\s\S]{0,500}allowCreate=\{false\}/.test(code)) {
    problems.push(
      `${FILE}: CREATE Load EntityPicker must not use allowCreate={false} — picker_law requires + Add new load`,
    );
  }
  // Explicit allowCreate near the load picker (not only the default) so regressions stay visible.
  // Window widened 600 -> 900 (2026-08-20, CC-3): the real block is 764 chars (selectedOption's
  // multi-line fallback + the allowCreate history comment pushed it past 600) — code is correct
  // (bare `allowCreate`, no `={false}`), the window was just too narrow to reach dataTestId.
  const loadBlock = code.match(/kind=["']load["'][\s\S]{0,900}dataTestId=["']accident-load["']/);
  if (!loadBlock || !/\ballowCreate\b/.test(loadBlock[0]) || /allowCreate=\{false\}/.test(loadBlock[0])) {
    problems.push(`${FILE}: CREATE Load EntityPicker (accident-load) must set allowCreate (not false)`);
  }
  if (/listUnits\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits directly (EntityPicker owns roster)`);
  }
  if (/listDispatchLoads\(/.test(code)) {
    problems.push(`${FILE}: must not call listDispatchLoads for load picker`);
  }
  if (!/kind=["']vendor["']/.test(code) || !/allowCreate/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind="vendor" allowCreate`);
  }
  if (/listVendors\(/.test(code)) {
    problems.push(`${FILE}: must not call listVendors directly (EntityPicker owns roster)`);
  }
  // Unit field must not be a bare Combobox with unitOptions
  if (/accident-unit-picker[\s\S]{0,400}<Combobox/.test(src)) {
    problems.push(`${FILE}: accident-unit-picker must not use Combobox`);
  }
  if (!/selectedOption=\{[\s\S]{0,220}?initialDriverId[\s\S]{0,220}?initialDriverName/.test(code)) {
    problems.push(`${FILE}: persisted driver picker must seed its reader-provided human label`);
  }
  const entityPicker = readRel(root, ENTITY_PICKER);
  if (!entityPicker || !/selectedOption\?:\s*EntityPickerOption/.test(entityPicker)
      || !/selectedOption\s*\?\s*\[selectedOption,\s*\.\.\.created\]/.test(entityPicker)) {
    problems.push(`${ENTITY_PICKER}: must preserve a human selectedOption outside the active roster`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-accident-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/safety");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "AccidentReportDrawer.tsx"),
      `const initialDriverId = "driver-1";
const initialDriverName = "Historical Driver";
listUnits({ limit: 200 })
<div data-testid="accident-unit-picker"><Combobox options={unitOptions} onSearch={setUnitSearch} /></div>
listDispatchLoads({ limit: 200 })
<EntityPicker kind="load" allowCreate={false} dataTestId="accident-load" />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
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
  console.log(`${LABEL} OK — AccidentReportDrawer EntityPicker unit+load+vendor`);
}
