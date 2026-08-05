#!/usr/bin/env node
/**
 * FactoringHome equipment-loan attribution — EntityPicker kind=load (not Combobox+listLoads).
 * Cursor even claim: 2436.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-loan-load-entity-picker";
const FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

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
  if (!/kind=["']load["'][\s\S]{0,400}dataTestId=["']factoring-loan-attribution-load["']/.test(code) &&
      !/dataTestId=["']factoring-loan-attribution-load["'][\s\S]{0,400}kind=["']load["']/.test(code)) {
    problems.push(`${FILE}: loan attribution must use EntityPicker kind=load (dataTestId=factoring-loan-attribution-load)`);
  }
  if (/listLoads\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listLoads — use EntityPicker`);
  }
  if (/attributionLoadsQuery/.test(code)) {
    problems.push(`${FILE}: must not keep attributionLoadsQuery — EntityPicker owns fetch`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-fact-loan-load-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/factoring");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "FactoringHome.tsx"),
      `import { listLoads } from "../../api/loads";
const attributionLoadsQuery = useQuery({ queryFn: () => listLoads({}) });
<Combobox options={attributionLoadsQuery.data} />`,
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
  console.log(`${LABEL} OK — FactoringHome loan attribution EntityPicker kind=load`);
}
