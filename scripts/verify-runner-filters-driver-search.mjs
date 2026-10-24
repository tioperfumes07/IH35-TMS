#!/usr/bin/env node
/**
 * CLS-SILENT-CAP / SAF-B29 — Reports RunnerFilters driver_select must server-search.
 * Was listDrivers({ search: "", limit: 200 }) — drivers past page 1 never appeared in report filters.
 * Cursor even claim: 2300.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from './lib/entity-multiselect-filter-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-runner-filters-driver-search";
const FILE = "apps/frontend/src/pages/reports/runners/RunnerFilters.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
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
  problems.push(...multiSelectFilterProblems(src,{file:FILE,kind:'driver'}));
  if (/listDrivers\(/.test(code)) problems.push(`${FILE}: driver roster must come from canonical searched multi-select, not a second capped query`);
  const wrapper = readRel(root, 'apps/frontend/src/components/EntityMultiSelect.tsx') ?? '';
  const registry = readRel(root, 'apps/frontend/src/components/parity/entityPickerRegistry.ts') ?? '';
  problems.push(...searchContractProblems(wrapper, registry));
  return problems;
}

function searchContractProblems(wrapper, registry) {
  const problems = [];
  const driver = registry.slice(registry.indexOf('  driver: {'), registry.indexOf('  unit: {'));
  for (const token of ['onSearch={setSearch}', 'serverSearch={config.serverSearch}', 'operatingCompanyId, kind, search', 'search: search || undefined']) if (!wrapper.includes(token)) problems.push(`EntityMultiSelect: missing searched roster contract ${token}`);
  for (const token of ['serverSearch: true','const search = opts?.search || undefined', 'await listDrivers({','operating_company_id: operatingCompanyId', '          search,']) if (!driver.includes(token)) problems.push(`driver registry: missing server search contract ${token}`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  selftestMultiSelectFilterContract();
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const wrapper = readRel(ROOT,'apps/frontend/src/components/EntityMultiSelect.tsx');
  const registry = readRel(ROOT,'apps/frontend/src/components/parity/entityPickerRegistry.ts');
  for (const token of ['onSearch={setSearch}', 'serverSearch={config.serverSearch}', 'search: search || undefined']) if (!searchContractProblems(wrapper.replace(token,'REMOVED'),registry).length) throw new Error(`escaped shared search plant ${token}`);
  if (!searchContractProblems(wrapper,registry.replace('const search = opts?.search || undefined','const search = undefined')).length) throw new Error('escaped driver search plant');
  const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tmp-runner-filters-"));
  try {
    const tmpStubDir = path.join(stubRoot, "apps/frontend/src/pages/reports/runners");
    fs.mkdirSync(tmpStubDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpStubDir, "RunnerFilters.tsx"),
      `listDrivers({ status: "Active", search: "", operating_company_id: id, limit: 200 })
if (filter.type === "driver_select") {
  return <SelectCombobox value={v} onChange={onChange} />;
}
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
  console.log(`${LABEL} OK — RunnerFilters driver search`);
}
