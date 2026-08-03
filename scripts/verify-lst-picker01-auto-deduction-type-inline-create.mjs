#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — AutoDeductionPolicies Type must use ReferenceSelect with
 * createKind=driver_deduction_type (same-table write to catalogs.driver_deduction_types by code).
 * Cursor even claim: 2094.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-auto-deduction-type-inline-create";

const PAGE = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const page = readRel(root, PAGE);
  const registry = readRel(root, REGISTRY);

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']driver_deduction_type["']/.test(code)) {
      problems.push(`${PAGE}: Type must use createKind=driver_deduction_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${PAGE}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']code["']/.test(code)) {
      problems.push(`${PAGE}: must select by code (createdValueField=code)`);
    }
    if (/No deduction types — add in Lists/.test(page)) {
      problems.push(`${PAGE}: must not send operators to Lists-only path`);
    }
    // Dual-path: Type field must not remain a bare SelectCombobox of catalog options.
    if (
      /SelectCombobox[\s\S]{0,400}deductionTypeOptions\.map/.test(code) ||
      /SelectCombobox[\s\S]{0,400}aria-label=["']Deduction type["']/.test(code)
    ) {
      problems.push(`${PAGE}: must not keep SelectCombobox dual path for Type`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/driver_deduction_type:\s*catalogEntry\(/.test(registry) && !/driver_deduction_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing driver_deduction_type entry`);
    }
    if (!/\/api\/v1\/catalogs\/driver\/deduction-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST driver/deduction-types`);
    }
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-lst-picker01-auto-deduction-"));
  try {
    const pageDir = path.join(stubRoot, "apps/frontend/src/pages/drivers");
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(pageDir, "AutoDeductionPolicies.tsx"),
      `export function AutoDeductionPolicies() {
  return (
    <SelectCombobox aria-label="Deduction type" value={deductionType}>
      <option>No deduction types — add in Lists</option>
      {deductionTypeOptions.map((type) => <option key={type.value}>{type.label}</option>)}
    </SelectCombobox>
  );
}
`
    );
    fs.copyFileSync(path.join(ROOT, REGISTRY), path.join(regDir, "catalogPickerRegistry.ts"));
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /createKind=driver_deduction_type/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted SelectCombobox stub did not FAIL createKind`);
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
  console.log(`${LABEL} OK — AutoDeductionPolicies deduction type inline create`);
}
