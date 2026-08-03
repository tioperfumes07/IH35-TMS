#!/usr/bin/env node
/**
 * SafetyIncidentsClusterSurface drawer — unit_id + load_id use EntityPicker
 * (server search; unit may +Create). Trailer stays Combobox (no EntityPickerKind trailer).
 * Cursor even claim: 2144.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-incidents-unit-load-entity-picker";
const FILE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";

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
  if (!/kind=["']unit["']/.test(src) || !/field-unit_id[\s\S]{0,500}EntityPicker/.test(src)) {
    problems.push(`${FILE}: field-unit_id must use EntityPicker kind="unit"`);
  }
  if (!/kind=["']load["']/.test(src) || !/field-load_id[\s\S]{0,500}EntityPicker/.test(src)) {
    problems.push(`${FILE}: field-load_id must use EntityPicker kind="load"`);
  }
  if (/field-unit_id[\s\S]{0,300}<Combobox/.test(src)) {
    problems.push(`${FILE}: field-unit_id must not use Combobox`);
  }
  if (/field-load_id[\s\S]{0,300}<Combobox/.test(src)) {
    problems.push(`${FILE}: field-load_id must not use Combobox`);
  }
  if (/listLoads\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) {
    problems.push(`${FILE}: must not call listLoads for drawer load picker`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-incidents-picker-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/safety/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SafetyIncidentsClusterSurface.tsx"),
      `listLoads({ limit: 200 })
<div data-testid={\`\${config.pageTestId}-field-unit_id\`}><Combobox options={unitComboboxOptions} /></div>
<div data-testid={\`\${config.pageTestId}-field-load_id\`}><Combobox options={loadComboboxOptions} /></div>
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
  console.log(`${LABEL} OK — incidents drawer EntityPicker unit+load`);
}
