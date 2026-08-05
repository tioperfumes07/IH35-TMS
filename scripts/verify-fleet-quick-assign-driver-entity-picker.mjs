#!/usr/bin/env node
/**
 * Fleet QuickAssignModal — EntityPicker kind=driver (not DriverPickerWithCreate Combobox page).
 * Cursor even claim: 2468.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-quick-assign-driver-entity-picker";
const FILE = "apps/frontend/src/components/fleet/QuickAssignModal.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) return [`missing ${FILE}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker[\s\S]*?kind=["']driver["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind=driver`);
  }
  if (/DriverPickerWithCreate/.test(code)) {
    problems.push(`${FILE}: must not use DriverPickerWithCreate — use EntityPicker`);
  }
  if (/listDrivers\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listDrivers`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-fleet-qa-drv-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/fleet");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "QuickAssignModal.tsx"),
      `import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";\n<DriverPickerWithCreate />`,
    );
    if (!collectProblems(stubRoot).length) {
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
  console.log(`${LABEL} OK — fleet QuickAssign EntityPicker kind=driver`);
}
