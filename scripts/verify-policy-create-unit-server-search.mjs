#!/usr/bin/env node
/**
 * PolicyCreateWizard — unit search is server-side (not silent listUnits limit:500 + client filter).
 * Cursor even claim: 2140.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-policy-create-unit-server-search";
const FILE = "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx";

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
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not silent-fetch listUnits(limit:500)`);
  }
  if (!/unitSearchQuery/.test(code) || !/search:\s*unitSearchQuery/.test(code) && !/search:\s*unitSearchQuery\.trim/.test(code)) {
    problems.push(`${FILE}: listUnits must pass search: unitSearchQuery`);
  }
  // RE-ANCHOR (found stale 2026-08-29): the queryKey array grew a trailing `activeChip` element
  // after unitSearchQuery (`[..., unitSearchQuery, activeChip]`), so the old `unitSearchQuery]`
  // end-of-array anchor no longer matched even though unitSearchQuery is still a real, correctly
  // scoped key element -- just no longer last. Match unitSearchQuery as a bare identifier anywhere
  // inside a `queryKey: [...]` array instead of anchoring on array position.
  if (!/queryKey:\s*\[[^\]]*\bunitSearchQuery\b[^\]]*\]/.test(code)) {
    problems.push(`${FILE}: unitsQuery key must include unitSearchQuery`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-policy-unit-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/insurance");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "PolicyCreateWizard.tsx"),
      `listUnits({ operating_company_id: operatingCompanyId, limit: 500 })
const filtered = allUnits.filter(u => u.unit_number.includes(unitSearchQuery))
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
  console.log(`${LABEL} OK — PolicyCreate unit server search`);
}
