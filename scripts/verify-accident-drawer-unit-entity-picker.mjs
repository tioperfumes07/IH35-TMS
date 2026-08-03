#!/usr/bin/env node
/**
 * AccidentReportDrawer — Unit/Load use EntityPicker (server search + optional unit create),
 * not silent Combobox over listUnits/listDispatchLoads.
 * Cursor even claim: 2142.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accident-drawer-unit-entity-picker";
const FILE = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";

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
  if (/listUnits\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits directly (EntityPicker owns roster)`);
  }
  if (/listDispatchLoads\(/.test(code)) {
    problems.push(`${FILE}: must not call listDispatchLoads for load picker`);
  }
  // Unit field must not be a bare Combobox with unitOptions
  if (/accident-unit-picker[\s\S]{0,400}<Combobox/.test(src)) {
    problems.push(`${FILE}: accident-unit-picker must not use Combobox`);
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
      `listUnits({ limit: 200 })
<div data-testid="accident-unit-picker"><Combobox options={unitOptions} onSearch={setUnitSearch} /></div>
listDispatchLoads({ limit: 200 })
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
  console.log(`${LABEL} OK — AccidentReportDrawer EntityPicker unit+load`);
}
