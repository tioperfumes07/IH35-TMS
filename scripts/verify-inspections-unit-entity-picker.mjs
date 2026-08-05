#!/usr/bin/env node
/**
 * Maintenance Inspections create/edit — EntityPicker kind=unit (not silent <select>+listUnits).
 * Cursor even claim: 2420.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inspections-unit-entity-picker";
const FILE = "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx";

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
    problems.push(`${FILE}: unit field must use EntityPicker kind=unit`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits for the create/edit unit picker — use EntityPicker`);
  }
  if (/<select[\s\S]*unit_id[\s\S]*units\.map/.test(code) || /units\.map\(\(u\)/.test(code)) {
    problems.push(`${FILE}: must not use silent <select> over units roster`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-insp-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/maintenance/inspections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "InspectionsPage.tsx"),
      `listUnits({ operating_company_id: companyId, status: "Active" })
<select value={draft.unit_id}>{units.map((u) => <option key={u.id} />)}</select>`,
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
  console.log(`${LABEL} OK — InspectionsPage EntityPicker kind=unit`);
}
