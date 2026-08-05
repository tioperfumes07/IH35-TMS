#!/usr/bin/env node
/**
 * Dispatch FilterBar Driver filter — EntityPicker kind=driver (not Combobox over listDrivers page).
 * Cursor even claim: 2462.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-filterbar-driver-entity-picker";
const FILE = "apps/frontend/src/components/dispatch/FilterBar.tsx";
const PAGE = "apps/frontend/src/pages/Dispatch.tsx";

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
  if (!/kind=["']driver["']/.test(code) || !/EntityPicker/.test(code)) {
    problems.push(`${FILE}: Driver filter must use EntityPicker kind=driver`);
  }
  if (!/data-testid=["']dispatch-filter-driver["']/.test(code)) {
    problems.push(`${FILE}: must keep data-testid=dispatch-filter-driver`);
  }
  if (!/operatingCompanyId/.test(code)) {
    problems.push(`${FILE}: must take operatingCompanyId for EntityPicker scope`);
  }
  const page = readRel(root, PAGE);
  if (page && !/FilterBar[\s\S]{0,400}operatingCompanyId=/.test(page)) {
    problems.push(`${PAGE}: FilterBar must receive operatingCompanyId`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-disp-filter-driver-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/dispatch");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "FilterBar.tsx"),
      `<div data-testid="dispatch-filter-driver"><Combobox options={drivers.map((d) => d)} /></div>`,
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/pages"), { recursive: true });
    fs.writeFileSync(path.join(stubRoot, "apps/frontend/src/pages/Dispatch.tsx"), `<FilterBar drivers={drivers} />`);
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
  console.log(`${LABEL} OK — FilterBar Driver EntityPicker kind=driver`);
}
