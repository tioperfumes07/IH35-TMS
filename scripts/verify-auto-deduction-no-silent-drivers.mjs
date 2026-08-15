#!/usr/bin/env node
/**
 * AutoDeductionPolicies — no silent listDrivers(limit:200) name map; EntityLink resolves labels.
 * LST-F5184 — list reverse filter is EntityPicker + URL sync (create form keeps DriverPickerWithCreate).
 * Cursor even claim: 2138.
 *
 * @matrix-built {"modules":["drivers"],"cols":["picker_law","reverse_link","connectivity"],"leafRe":"^drivers\\.tab\\.auto_deductions$","task":"LST-F5184-auto-deduction-driver-filter","vertical":"column-wave"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-auto-deduction-no-silent-drivers";
const FILE = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";

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
  if (/listDrivers\(/.test(code)) {
    problems.push(`${FILE}: must not silent-fetch listDrivers for name map`);
  }
  if (!/DriverPickerWithCreate/.test(code)) {
    problems.push(`${FILE}: create form must keep DriverPickerWithCreate`);
  }
  if (!/EntityLink/.test(code) || !/kind=["']driver["']/.test(code)) {
    problems.push(`${FILE}: list must EntityLink kind=driver (no capped name map)`);
  }
  // LST-F5184 — reverse list filter
  if (
    !/dataTestId="auto-deduction-policies-filter-driver"/.test(src) ||
    !/allowCreate=\{false\}/.test(src) ||
    !/searchParams\.get\("driver_id"\)/.test(src) ||
    !/setSearchParams/.test(src) ||
    !/EntityPicker/.test(src)
  ) {
    problems.push(`${FILE}: must render EntityPicker driver filter (allowCreate=false) synced to ?driver_id=`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-auto-deduct-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/drivers");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "AutoDeductionPolicies.tsx"),
      `listDrivers({ operating_company_id: operatingCompanyId, limit: 200 })
const driverNameById = new Map()
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
  console.log(`${LABEL} OK — AutoDeduction no silent drivers`);
}
