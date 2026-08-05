#!/usr/bin/env node
/**
 * ClaimCreateModal — EntityPicker unit/load/trailer (server search via registry, not silent Combobox pages).
 * Cursor even claim: 2122 (updated by 2414 EntityPicker ratchet).
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
  if (!/EntityPicker[\s\S]*?kind=["']load["']/.test(code)) {
    problems.push(`${FILE}: load field must use EntityPicker kind=load`);
  }
  if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(code)) {
    problems.push(`${FILE}: trailer field must use EntityPicker kind=trailer (mdata.equipment FK)`);
  }
  if (/from ["'].*Combobox["']/.test(src) || /<Combobox[\s>]/.test(code)) {
    problems.push(`${FILE}: must not use Combobox for entity fields — use EntityPicker`);
  }
  if (/listLoads\(/.test(code) || /listUnits\(/.test(code)) {
    problems.push(`${FILE}: must not local-fetch load/trailer rosters — EntityPicker owns server search`);
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet/load pages`);
  }
  if (/include:\s*["']trailers["']/.test(code)) {
    problems.push(`${FILE}: trailer must use EntityPicker kind=trailer (mdata.equipment), not listUnits(include:trailers)`);
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
      `import { Combobox } from "../Combobox";
listUnits({ operating_company_id: id, limit: 500, include: "trailers" })
listLoads({ operating_company_id: [id], limit: 200 })
<Combobox options={loadOptions} onSearch={setLoadSearch} />
<Combobox options={trailerOptions} onSearch={setTrailerSearch} />
<EntityPicker kind="unit" />
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
  console.log(`${LABEL} OK — ClaimCreate EntityPicker unit/load/trailer`);
}
