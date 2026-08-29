#!/usr/bin/env node
/**
 * AutoDeductionPolicies — no silent listDrivers(limit:200) name map; EntityLink resolves labels.
 * LST-F5184 — list reverse filter is EntityPicker + URL sync (create form keeps DriverPickerWithCreate).
 * Cursor even claim: 2138.
 *
 * @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["drivers.panel.auto_deduction_policies"],"task":"CLASS-F5878-DRIVER-DEDUCTION-PANELS-REVERSE-EXACT-LEAVES","vertical":"class-sweep"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-auto-deduction-no-silent-drivers";
const FILE = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";
const MATRIX = "docs/specs/scoreboard/modules/drivers.required.json";
const SELF = "scripts/verify-auto-deduction-no-silent-drivers.mjs";
const HEADER = ' * @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["drivers.panel.auto_deduction_policies"],"task":"CLASS-F5878-DRIVER-DEDUCTION-PANELS-REVERSE-EXACT-LEAVES","vertical":"class-sweep"}';

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
  const hook = readRel(root, "apps/frontend/src/hooks/useAutoDeductionPolicies.ts") ?? "";
  if ((hook.match(/onError:/g) ?? []).length < 3) {
    problems.push("useAutoDeductionPolicies.ts: create/patch/cancel mutations must each have onError toast (FINDING 50208)");
  }
  return problems;
}

function collectEvidenceProblems(matrixSrc, selfSrc) {
  const problems = [];
  try {
    const leaf = JSON.parse(matrixSrc).leaves?.find((item) => item.id === "drivers.panel.auto_deduction_policies");
    if (!leaf?.required?.includes("reverse_link")) problems.push("drivers.panel.auto_deduction_policies must require reverse_link");
  } catch { problems.push(`${MATRIX}: must parse`); }
  if (!selfSrc.split("\n").includes(HEADER)) problems.push(`${SELF}: exact Built header missing`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  const matrix = readRel(ROOT, MATRIX) ?? "";
  const self = readRel(ROOT, SELF) ?? "";
  const evidenceBaseline = collectEvidenceProblems(matrix, self);
  if (baseline.length || evidenceBaseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of [...baseline, ...evidenceBaseline]) console.error("  - " + p);
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
  const matrixMutant = matrix.replace('"id": "drivers.panel.auto_deduction_policies"', '"id": "drivers.panel.auto_deduction_policies.removed"');
  if (!collectEvidenceProblems(matrixMutant, self).some((problem) => problem.includes("must require reverse_link"))) {
    console.error(`${LABEL} SELFTEST FAIL: Required mutation escaped`);
    process.exit(1);
  }
  if (!collectEvidenceProblems(matrix, self.replace(HEADER, `${HEADER}.removed`)).some((problem) => problem.includes("exact Built header missing"))) {
    console.error(`${LABEL} SELFTEST FAIL: header mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 3/3 runtime/evidence defects rejected`);
} else {
  const problems = [...collectProblems(), ...collectEvidenceProblems(readRel(ROOT, MATRIX) ?? "", readRel(ROOT, SELF) ?? "")];
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — AutoDeduction no silent drivers`);
}
