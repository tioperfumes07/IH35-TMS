#!/usr/bin/env node
/**
 * Banking UnitAutocomplete — EntityPicker kind=unit (not custom listUnits dropdown).
 * Cursor even claim: 2428.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-unit-autocomplete-entity-picker";
const FILE = "apps/frontend/src/components/banking/UnitAutocomplete.tsx";

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
    problems.push(`${FILE}: must use EntityPicker kind=unit`);
  }
  if (/listUnits\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listUnits — use EntityPicker`);
  }
  if (!/data-unit-autocomplete/.test(code)) {
    problems.push(`${FILE}: must keep data-unit-autocomplete marker`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bank-unit-ac-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/banking");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "UnitAutocomplete.tsx"), `listUnits({ limit: 500 })\n<input data-unit-autocomplete />`);
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
  console.log(`${LABEL} OK — UnitAutocomplete EntityPicker kind=unit`);
}
