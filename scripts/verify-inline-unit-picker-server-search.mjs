#!/usr/bin/env node
/**
 * InlineUnitPicker — EntityPicker kind=unit (superseded server-search Combobox check).
 * Cursor even claim: 2120 · ratcheted by EP-UNIT-KIND-SWEEP claim 2540.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inline-unit-picker-server-search";
const FILE = "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx";

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
  if (!/EntityPicker/.test(code) || !/kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind="unit"`);
  }
  if (/\blistUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits directly — EntityPicker registry owns roster reads`);
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
  const tmpStubRoot = fs.mkdtempSync(path.join(os.tmpdir(), ".tmp-inline-unit-"));
  try {
    const tmpStubDir = path.join(tmpStubRoot, "apps/frontend/src/components/dispatch");
    fs.mkdirSync(tmpStubDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpStubDir, "InlineUnitPicker.tsx"),
      `listUnits({ operating_company_id: id, limit: 500 })
<Combobox options={options} value={unitId} />
`
    );
    const planted = collectProblems(tmpStubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpStubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — InlineUnitPicker EntityPicker kind=unit`);
}
