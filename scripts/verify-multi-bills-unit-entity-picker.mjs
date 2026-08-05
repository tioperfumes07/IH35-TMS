#!/usr/bin/env node
/**
 * CreateMultipleBillsPage Unit column — EntityPicker kind=unit (not Combobox+listUnits).
 * Cursor even claim: 2444.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-multi-bills-unit-entity-picker";
const FILE = "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx";

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
  if (!/kind=["']unit["']/.test(code) || !/EntityPicker/.test(code)) {
    problems.push(`${FILE}: unit column must use EntityPicker kind=unit`);
  }
  if (!/data-testid=["']multi-bills-unit["']/.test(code)) {
    problems.push(`${FILE}: must keep data-testid=multi-bills-unit wrapper`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits — use EntityPicker`);
  }
  if (/CreateUnitModal/.test(code)) {
    problems.push(`${FILE}: must not keep CreateUnitModal — EntityPicker owns inline create`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-multi-bills-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/accounting");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "CreateMultipleBillsPage.tsx"),
      `import { listUnits } from "../../api/mdata";
import { CreateUnitModal } from "../../components/fleet/CreateUnitModal";
listUnits({});
<div data-testid="multi-bills-unit"><Combobox /></div>
<CreateUnitModal />`,
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
  console.log(`${LABEL} OK — CreateMultipleBillsPage EntityPicker kind=unit`);
}
