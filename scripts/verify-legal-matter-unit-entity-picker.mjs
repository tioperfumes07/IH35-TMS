#!/usr/bin/env node
/**
 * LegalMatterFormFields — unit must be EntityPicker (not silent listUnits limit:500 SelectCombobox).
 * Cursor even claim: 2130.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-matter-unit-entity-picker";
const FILE = "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx";

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
  if (/listUnits\(/.test(code) || /limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not silent-fetch listUnits(limit:500)`);
  }
  if (!/legal-matter-unit-picker/.test(src)) {
    problems.push(`${FILE}: legal-matter-unit-picker testid missing`);
  }
  if (!/EntityPicker/.test(code) || !/kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: unit field must use EntityPicker kind="unit"`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-legal-matter-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/legal/matters");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "LegalMatterFormFields.tsx"),
      `data-testid="legal-matter-unit-picker"
listUnits({ operating_company_id: id, limit: 500 })
<SelectCombobox value={form.unit_id}>{(unitsQuery.data??[]).map(u=><option/>)}</SelectCombobox>
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
  console.log(`${LABEL} OK — legal matter unit EntityPicker`);
}
