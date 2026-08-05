#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-runner-filters-entity-pickers";
const TARGET = "apps/frontend/src/pages/reports/runners/RunnerFilters.tsx";
const SELFTEST = process.argv.includes("--selftest");
export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/kind=["']driver["']/.test(code) || !/driver_select/.test(src)) problems.push(`${TARGET}: driver_select must use EntityPicker kind=driver`);
  if (!/kind=["']unit["']/.test(code) || !/unit_select/.test(src)) problems.push(`${TARGET}: unit_select must use EntityPicker kind=unit`);
  if (/listDrivers\(|listUnits\(/.test(code)) problems.push(`${TARGET}: must not local-fetch driver/unit roster`);
  if (/from ["'].*\/Combobox["']/.test(src)) problems.push(`${TARGET}: Combobox import must be removed`);
  return problems;
}
if (SELFTEST) {
  const bad = `import { Combobox } from "x"; listDrivers({}); listUnits({}); driver_select unit_select`;
  const good = `driver_select unit_select <EntityPicker kind="driver" /><EntityPicker kind="unit" />`;
  if (collectProblems(bad).length < 2 || collectProblems(good).length !== 0) { console.error(LABEL,'SELFTEST FAIL'); process.exit(1); }
  console.log(LABEL,'SELFTEST OK'); process.exit(0);
}
const problems = collectProblems(fs.readFileSync(path.join(ROOT,TARGET),'utf8'));
if (problems.length) { console.error(LABEL,'FAIL'); problems.forEach(p=>console.error(' -',p)); process.exit(1); }
console.log(LABEL,'OK');
