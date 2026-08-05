#!/usr/bin/env node
/**
 * InlineUnitPicker — EntityPicker kind=unit (server search via registry, not silent listUnits limit:500).
 * Cursor even claim: 2120 (sibling intent preserved after EntityPicker migration).
 */
import fs from "node:fs";
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
  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: must use EntityPicker kind=unit`);
  }
  if (/listUnits\s*\(/.test(code) || /limit:\s*200/.test(code) || /limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not silent-fetch listUnits limit:200/500 — use EntityPicker kind=unit`);
  }
  if (/from\s+["'][^"']*Combobox["']/.test(code) && !/EntityPicker/.test(code)) {
    problems.push(`${FILE}: must not use raw Combobox for unit roster`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-inline-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/dispatch");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "InlineUnitPicker.tsx"),
      `listUnits({ operating_company_id: id, limit: 500 })
<Combobox options={options} value={unitId} />
`,
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
  console.log(`${LABEL} OK — InlineUnitPicker EntityPicker kind=unit`);
}
