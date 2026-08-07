#!/usr/bin/env node
/**
 * ClaimCreateModal — load + trailer must use EntityPicker (kind=load / kind=trailer),
 * unit stays EntityPicker kind=unit. Not Combobox + onSearch. Cursor even claim: 2414.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-create-load-trailer-entity-pickers";
const FILE = "apps/frontend/src/components/insurance/ClaimCreateModal.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: unit/asset must use EntityPicker kind=unit`);
  }
  if (!/kind=["']load["']/.test(code) || !/EntityPicker/.test(src)) {
    problems.push(`${FILE}: load must use EntityPicker kind=load`);
  }
  if (!/kind=["']trailer["']/.test(code)) {
    problems.push(`${FILE}: trailer must use EntityPicker kind=trailer`);
  }
  if (/listLoads\(/.test(code) || /listUnits\(/.test(code)) {
    problems.push(`${FILE}: must not local-fetch load/trailer roster — EntityPicker owns search`);
  }
  if (/onSearch=\{setLoadSearch\}/.test(code) || /onSearch=\{setTrailerSearch\}/.test(code)) {
    problems.push(`${FILE}: Combobox onSearch must not remain on load/trailer`);
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet/load pages`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    listLoads({ limit: 200 })
    listUnits({ limit: 500 })
    <Combobox onSearch={setLoadSearch} />
    <Combobox onSearch={setTrailerSearch} />
  `;
  const good = `
    <EntityPicker kind="unit" />
    <EntityPicker kind="load" />
    <EntityPicker kind="trailer" />
  `;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 3 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — ClaimCreate load/trailer EntityPickers`);
