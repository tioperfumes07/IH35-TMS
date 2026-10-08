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
  // Driver/unit roster pickers must remain EntityPicker; a generic Combobox may be used for non-entity filters (e.g. company).
  const driverBlock = src.match(/if\s*\(\s*filter\.type\s*===\s*["']driver_select["']\s*\)\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? "";
  const unitBlock = src.match(/if\s*\(\s*filter\.type\s*===\s*["']unit_select["']\s*\)\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? "";
  if (/<Combobox\b/.test(driverBlock) || /<Combobox\b/.test(unitBlock)) {
    problems.push(`${TARGET}: driver_select/unit_select must use EntityPicker, not Combobox`);
  }
  // ROUND 441.22: every dropdown is type-to-filter; native date inputs are not allowed.
  if (/<input\s+type=["']month["']/.test(code)) {
    problems.push(`${TARGET}: month_picker must use a type-to-filter Combobox, not a native <input type="month">`);
  }
  return problems;
}
if (SELFTEST) {
  const badLocalFetch = `driver_select unit_select listDrivers({}) listUnits({})`;
  const badComboboxDriver = `driver_select <Combobox options={[]} /> if (filter.type === "driver_select") { return <Combobox /> } unit_select <EntityPicker kind="unit" />`;
  const badMonthInput = `month_picker if (filter.type === "month_picker") { return <input type="month" className="w-full" /> }`;
  const good = `driver_select unit_select if (filter.type === "driver_select") { return <EntityPicker kind="driver" /> } if (filter.type === "unit_select") { return <EntityPicker kind="unit" /> } if (filter.type === "company_select") { return <Combobox options={companies} /> } if (filter.type === "month_picker") { return <Combobox options={months} /> }`;
  if (collectProblems(badLocalFetch).length < 1) { console.error(LABEL,'SELFTEST FAIL — local fetch not detected'); process.exit(1); }
  if (collectProblems(badComboboxDriver).length < 1) { console.error(LABEL,'SELFTEST FAIL — Combobox in driver block not detected'); process.exit(1); }
  if (collectProblems(badMonthInput).length < 1) { console.error(LABEL,'SELFTEST FAIL — native month input not detected'); process.exit(1); }
  if (collectProblems(good).length !== 0) { console.error(LABEL,'SELFTEST FAIL — valid Combobox for company/month rejected:', collectProblems(good)); process.exit(1); }
  console.log(LABEL,'SELFTEST OK'); process.exit(0);
}
const problems = collectProblems(fs.readFileSync(path.join(ROOT,TARGET),'utf8'));
if (problems.length) { console.error(LABEL,'FAIL'); problems.forEach(p=>console.error(' -',p)); process.exit(1); }
console.log(LABEL,'OK');
