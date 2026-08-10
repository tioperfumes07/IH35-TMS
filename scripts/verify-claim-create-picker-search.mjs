#!/usr/bin/env node
/**
 * ClaimCreateModal — EntityPicker unit + load/trailer server search (not silent limit:500).
 * Cursor even claim: 2122.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-create-picker-search";
const FILE = "apps/frontend/src/components/insurance/ClaimCreateModal.tsx";

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
    problems.push(`${FILE}: unit/asset must use EntityPicker kind=unit`);
  }
  const hasLoadEntity =
    /EntityPicker/.test(src) && (/kind=["']load["']/.test(code) || /kind=\{\s*["']load["']\s*\}/.test(code));
  const hasTrailerEntity =
    /EntityPicker/.test(src) && (/kind=["']trailer["']/.test(code) || /kind=\{\s*["']trailer["']\s*\}/.test(code));
  const hasLoadLegacy = /loadSearch/.test(code) && /onSearch=\{setLoadSearch\}/.test(code);
  const hasTrailerLegacy = /trailerSearch/.test(code) && /onSearch=\{setTrailerSearch\}/.test(code);
  if (!hasLoadEntity && !hasLoadLegacy) {
    problems.push(`${FILE}: load must be EntityPicker kind=load OR Combobox with loadSearch + onSearch`);
  }
  if (!hasTrailerEntity && !hasTrailerLegacy) {
    problems.push(`${FILE}: trailer must be EntityPicker kind=trailer OR Combobox with trailerSearch + onSearch`);
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet/load pages`);
  }
  if (!/<Combobox[\s\S]*?id=["']claim-create-accident-picker["']/.test(code)) {
    problems.push(`${FILE}: accident report must use the searchable Combobox`);
  }
  if (/<select[\s\S]*?value=\{form\.accident_report_id\}/.test(code)) {
    problems.push(`${FILE}: accident report must not regress to a native UUID-valued select`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-claim-create-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/insurance");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "ClaimCreateModal.tsx"),
      `listUnits({ operating_company_id: id, limit: 500 })
listLoads({ operating_company_id: [id], limit: 200 })
<Combobox options={unitOptions} />
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
  console.log(`${LABEL} OK — ClaimCreate picker search`);
}
