#!/usr/bin/env node
/**
 * FineCreateModal related unit/load must use EntityPicker (kind=unit / kind=load),
 * not a silent Combobox roster page. Cursor even claim: 2388.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fine-create-unit-load-entity-picker";
const TARGET = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/data-testid=["']fine-create-unit-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=fine-create-unit-picker`);
  }
  if (!/data-testid=["']fine-create-load-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=fine-create-load-picker`);
  }
  if (!/kind=["']unit["']/.test(code) || !/setRelatedUnitId/.test(code)) {
    problems.push(`${TARGET}: related unit must use EntityPicker kind=unit`);
  }
  if (!/kind=["']load["']/.test(code) || !/setRelatedLoadId/.test(code)) {
    problems.push(`${TARGET}: related load must use EntityPicker kind=load`);
  }
  // Forbid Combobox wired to related unit/load
  if (/Combobox[\s\S]{0,200}relatedUnitId|relatedUnitId[\s\S]{0,80}Combobox/.test(code)) {
    problems.push(`${TARGET}: related unit must not use Combobox`);
  }
  if (/Combobox[\s\S]{0,200}relatedLoadId|relatedLoadId[\s\S]{0,80}Combobox/.test(code)) {
    problems.push(`${TARGET}: related load must not use Combobox`);
  }
  if (/listDispatchLoads|listUnits\(/.test(code)) {
    problems.push(`${TARGET}: must not local-fetch unit/load roster — EntityPicker owns search`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    <Combobox options={unitOptions} value={relatedUnitId} onChange={setRelatedUnitId} />
    <Combobox options={loadOptions} value={relatedLoadId} onChange={setRelatedLoadId} />
    listUnits({ limit: 200 })
    listDispatchLoads({})
  `;
  const good = `
    <div data-testid="fine-create-unit-picker">
      <EntityPicker kind="unit" onChange={setRelatedUnitId} />
    </div>
    <div data-testid="fine-create-load-picker">
      <EntityPicker kind="load" onChange={setRelatedLoadId} />
    </div>
  `;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 2 || goodP.length !== 0) {
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
console.log(`${LABEL} OK — FineCreate related unit/load use EntityPicker`);
