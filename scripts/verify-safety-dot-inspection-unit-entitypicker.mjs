#!/usr/bin/env node
/**
 * SAF-F14 / S-A10 — DOT Inspections creator unit field uses EntityPicker kind="unit"
 * (server search + inline "+ Create unit" via allowCreate), not Combobox+listUnits.
 * Cursor even claim: 2164.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-dot-inspection-unit-entitypicker";
const FILE = "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/EntityPicker/.test(code) || !/kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: unit creator must use EntityPicker kind="unit"`);
  }
  if (/listUnits\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits directly — EntityPicker owns server search`);
  }
  if (/unitSearch/.test(code) || /unitOptions/.test(code)) {
    problems.push(`${FILE}: must not keep local unitSearch/unitOptions — EntityPicker handles roster search`);
  }
  if (/CreateUnitModal/.test(code)) {
    problems.push(`${FILE}: must not mount CreateUnitModal — EntityPicker inline create owns unit create`);
  }
  const unitBlock =
    code.match(/data-testid="dot-inspection-unit-picker"[\s\S]{0,500}/)?.[0] ??
    code.match(/EntityPicker[\s\S]*?kind=["']unit["'][\s\S]{0,300}/)?.[0] ??
    "";
  if (unitBlock && /allowCreate=\{false\}/.test(unitBlock)) {
    problems.push(`${FILE}: unit EntityPicker must allow inline create (allowCreate not false)`);
  }
  if (!/data-testid="dot-inspection-unit-picker"/.test(code)) {
    problems.push(`${FILE}: missing data-testid="dot-inspection-unit-picker"`);
  }
  if (!/DriverPickerWithCreate/.test(code)) {
    problems.push(`${FILE}: driver creator must still use DriverPickerWithCreate`);
  }
  // LST-F5189 — list reverse filters must sync URL.
  if (
    !/dataTestId="dot-inspections-filter-driver"/.test(src) ||
    !/setSearchParams/.test(src) ||
    !/searchParams\.get\("driver_id"\)/.test(src)
  ) {
    problems.push(`${FILE}: list driver filter must EntityPicker + setSearchParams ?driver_id=`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-dot-unit-ep-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/safety/tabs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "DOTInspectionsTab.tsx"),
      `const unitSearch = "";
listUnits({ search: unitSearch });
<div data-testid="dot-inspection-unit-picker"><Combobox options={unitOptions} /></div>
<CreateUnitModal />
<DriverPickerWithCreate />
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
  console.log(`${LABEL} OK — DOT Inspections unit creator uses EntityPicker`);
}
