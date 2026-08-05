#!/usr/bin/env node
/**
 * Severe Repair Mark Unit OOS — EntityPicker kind=unit (not SelectCombobox+listUnits).
 * Cursor even claim: 2426.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-severe-oos-unit-entity-picker";
const FILE = "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx";

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
  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: Mark OOS unit must use EntityPicker kind=unit`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits for Mark OOS — use EntityPicker`);
  }
  if (/SelectCombobox/.test(code) && /selectedUnitId/.test(code)) {
    problems.push(`${FILE}: must not use SelectCombobox for Mark OOS unit roster`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-severe-oos-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/maintenance/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SevereRepairOosTab.tsx"),
      `listUnits({ operating_company_id })
<SelectCombobox value={selectedUnitId}>{(unitsQuery.data?.units ?? []).map()}</SelectCombobox>`,
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
  console.log(`${LABEL} OK — SevereRepairOosTab EntityPicker kind=unit`);
}
