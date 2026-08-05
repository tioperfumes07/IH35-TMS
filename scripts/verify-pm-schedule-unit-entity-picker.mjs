#!/usr/bin/env node
/**
 * PM Schedule create — EntityPicker kind=unit (not silent <select>+listUnits).
 * Cursor even claim: 2422.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pm-schedule-unit-entity-picker";
const FILE = "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx";

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
  if (!/data-testid=["']pm-schedule-unit["']/.test(code)) {
    problems.push(`${FILE}: must keep data-testid=pm-schedule-unit`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits — use EntityPicker`);
  }
  if (/units\.map\(/.test(code)) {
    problems.push(`${FILE}: must not render silent units.map <select> roster`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-pm-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/maintenance/pm-schedule");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "PmSchedulePage.tsx"),
      `listUnits({ status: "Active" })
<select data-testid="pm-schedule-unit">{units.map((u) => <option />)}</select>`,
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
  console.log(`${LABEL} OK — PmSchedulePage EntityPicker kind=unit`);
}
