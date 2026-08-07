#!/usr/bin/env node
/**
 * CreateAdvanceModal load + trailer must use EntityPicker (kind=load / kind=trailer),
 * not Combobox over listLoads / listUnits pages. Cursor even claim: 2396.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advance-load-trailer-entity-picker";
const TARGET = "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/data-testid=["']cash-advance-load-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=cash-advance-load-picker`);
  }
  if (!/data-testid=["']cash-advance-trailer-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=cash-advance-trailer-picker`);
  }
  if (!/kind=["']load["']/.test(code) || !/setLoadId/.test(code)) {
    problems.push(`${TARGET}: load must use EntityPicker kind=load`);
  }
  if (!/kind=["']trailer["']/.test(code) || !/setTrailerId/.test(code)) {
    problems.push(`${TARGET}: trailer must use EntityPicker kind=trailer`);
  }
  if (/Combobox[\s\S]{0,200}loadId|loadOptions[\s\S]{0,80}Combobox/.test(code)) {
    problems.push(`${TARGET}: load must not use Combobox`);
  }
  if (/Combobox[\s\S]{0,200}trailerId|trailerOptions[\s\S]{0,80}Combobox/.test(code)) {
    problems.push(`${TARGET}: trailer must not use Combobox`);
  }
  if (/listLoads\(|listUnits\(/.test(code)) {
    problems.push(`${TARGET}: must not local-fetch load/trailer roster — EntityPicker owns search`);
  }
  if (/from ["'].*\/Combobox["']/.test(src)) {
    problems.push(`${TARGET}: Combobox import must be removed`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "../../../components/Combobox";
    listLoads({})
    listUnits({})
    <Combobox options={loadOptions} value={loadId} onChange={setLoadId} />
    <Combobox options={trailerOptions} value={trailerId} onChange={setTrailerId} />
  `;
  const good = `
    <div data-testid="cash-advance-load-picker">
      <EntityPicker kind="load" onChange={setLoadId} />
    </div>
    <div data-testid="cash-advance-trailer-picker">
      <EntityPicker kind="trailer" onChange={setTrailerId} />
    </div>
  `;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 3 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
const src = fs.readFileSync(abs, "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — cash advance load/trailer use EntityPicker`);
