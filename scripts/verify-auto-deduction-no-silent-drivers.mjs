#!/usr/bin/env node
/**
 * AutoDeductionPolicies — no silent listDrivers(limit:200) name map; EntityLink resolves labels.
 * Cursor even claim: 2138.
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
