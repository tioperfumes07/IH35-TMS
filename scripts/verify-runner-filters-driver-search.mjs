#!/usr/bin/env node
/**
 * CLS-SILENT-CAP / SAF-B29 — Reports RunnerFilters driver_select must server-search.
 * Was listDrivers({ search: "", limit: 200 }) — drivers past page 1 never appeared in report filters.
 * Cursor even claim: 2300.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (!/driverSearch/.test(code)) {
    problems.push(`${FILE}: must declare driverSearch state for server type-ahead`);
  }
  if (/search:\s*""/.test(code)) {
    problems.push(`${FILE}: must not hardcode search:"" with limit:200 (silent cap)`);
  }
  if (!/search:\s*driverSearch/.test(code)) {
    problems.push(`${FILE}: listDrivers must pass search: driverSearch || undefined`);
  }
  if (!/onSearch=\{setDriverSearch\}/.test(src)) {
    problems.push(`${FILE}: driver Combobox must wire onSearch={setDriverSearch}`);
  }
  if (!/queryKey:[\s\S]*driverSearch/.test(code)) {
    problems.push(`${FILE}: driversQuery queryKey must include driverSearch`);
  }
  if (/driver_select[\s\S]{0,800}SelectCombobox/.test(src)) {
    problems.push(`${FILE}: driver_select must use Combobox with onSearch, not SelectCombobox`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-runner-filters-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/reports/runners");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "RunnerFilters.tsx"),
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
