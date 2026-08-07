#!/usr/bin/env node
/**
 * HosViewerSection — driver picker must server-search (not silent listDrivers limit:500).
 * Accepts either legacy Combobox+onSearch OR EntityPicker kind="driver" (picker law).
 * Cursor even claim: 2124.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-viewer-driver-search";
const FILE = "apps/frontend/src/pages/compliance/HosViewerSection.tsx";

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
  const hasEntityPicker =
    /EntityPicker/.test(src) &&
    (/kind=["']driver["']/.test(src) || /kind=\{\s*["']driver["']\s*\}/.test(src));
  const hasLegacySearch = /driverSearch/.test(code) && /onSearch=\{setDriverSearch\}/.test(code);
  if (!hasEntityPicker && !hasLegacySearch) {
    problems.push(
      `${FILE}: driver picker must be EntityPicker kind="driver" OR Combobox with driverSearch + onSearch`
    );
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent listDrivers limit:500`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-hos-viewer-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/compliance");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "HosViewerSection.tsx"),
      `listDrivers({ operating_company_id: id, status: "Active", limit: 500 })
<Combobox options={options} value={driverId} />
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
  console.log(`${LABEL} OK — HosViewer driver search (EntityPicker or Combobox)`);
}
