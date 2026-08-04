#!/usr/bin/env node
/**
 * QuickAssignModal — EntityPicker unit + trailer Combobox server search (not silent SelectCombobox 500).
 * Cursor even claim: 2116.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-quick-assign-entitypicker";
const FILE = "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx";

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
  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: unit must use EntityPicker kind=unit`);
  }
  if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(code)) {
    problems.push(`${FILE}: trailer must use EntityPicker kind=trailer`);
  }
  if (/SelectCombobox/.test(code)) {
    problems.push(`${FILE}: must not use SelectCombobox for unit/trailer`);
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet page`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-quick-assign-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/dispatch/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "QuickAssignModal.tsx"),
      `import { SelectCombobox } from "../../../components/shared/SelectCombobox";
listUnits({ operating_company_id: id, include: "trailers", limit: 500 })
<SelectCombobox value={unitId}>{truckOptions.map(...)}</SelectCombobox>
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
  console.log(`${LABEL} OK — QuickAssign EntityPicker + trailer search`);
}
