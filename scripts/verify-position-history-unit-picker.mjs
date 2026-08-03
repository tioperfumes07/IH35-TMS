#!/usr/bin/env node
/**
 * PositionHistoryPage — unit filter must be EntityPicker (not raw UUID text).
 * Cursor even claim: 2126.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-position-history-unit-picker";
const FILE = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";

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
    problems.push(`${FILE}: unit filter must use EntityPicker kind="unit"`);
  }
  if (/placeholder=["']Filter by unit["']/.test(code)) {
    problems.push(`${FILE}: must not use raw text placeholder "Filter by unit"`);
  }
  if (/Unit ID:/.test(src) && /type=["']text["']/.test(code)) {
    problems.push(`${FILE}: must not keep raw Unit ID text input`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-position-history-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/safety");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "PositionHistoryPage.tsx"),
      `<label>Unit ID:</label>
<input type="text" value={unitFilter} placeholder="Filter by unit" />
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
  console.log(`${LABEL} OK — PositionHistory unit EntityPicker`);
}
