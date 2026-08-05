#!/usr/bin/env node
/**
 * FactoringHome equipment-loan create — EntityPicker kind=unit (not Combobox+listUnits).
 * Cursor even claim: 2434.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-loan-unit-entity-picker";
const FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

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
  if (!/EntityPicker[\s\S]*?kind=["']unit["'][\s\S]*?factoring-loan-equipment-unit/.test(code) &&
      !/dataTestId=["']factoring-loan-equipment-unit["'][\s\S]*?kind=["']unit["']/.test(code) &&
      !/kind=["']unit["'][\s\S]{0,400}dataTestId=["']factoring-loan-equipment-unit["']/.test(code)) {
    problems.push(`${FILE}: equipment loan create must use EntityPicker kind=unit (dataTestId=factoring-loan-equipment-unit)`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits — use EntityPicker`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-fact-loan-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/factoring");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "FactoringHome.tsx"),
      `import { listUnits } from "../../api/mdata";
listUnits({});
<Combobox options={unitsQuery.data} />`,
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
  console.log(`${LABEL} OK — FactoringHome loan equipment EntityPicker kind=unit`);
}
