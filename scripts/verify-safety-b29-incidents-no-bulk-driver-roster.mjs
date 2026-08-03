#!/usr/bin/env node
/**
 * SAF-B29 wave-6 — SafetyIncidentsClusterSurface must not bulk listDrivers(limit:200)
 * for labels. List/detail APIs JOIN driver_name; pickers use EntityPicker / DriverPickerWithCreate.
 * Cursor even claim: 2096.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-b29-incidents-no-bulk-driver-roster";
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
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (/listDrivers\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listDrivers (bulk roster for labels)`);
  }
  if (/driverNameById/.test(code)) {
    problems.push(`${FILE}: must not keep driverNameById map from capped roster`);
  }
  if (!/driver_name/.test(code)) {
    problems.push(`${FILE}: must use server-joined driver_name for labels`);
  }
  if (!/EntityLink[\s\S]*?kind=["']driver["']/.test(code)) {
    problems.push(`${FILE}: detail/list must EntityLink kind=driver`);
  }
  // Detail read-only path must prefer detail.driver_name (not a roster map).
  if (!/detail\.driver_name|detail\?\.driver_name/.test(code)) {
    problems.push(`${FILE}: read-only detail must reference detail.driver_name`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-saf-b29-incidents-drivers-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/safety/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SafetyIncidentsClusterSurface.tsx"),
      `import { listDrivers } from "../../../api/mdata";
const driversQuery = useQuery({
  queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, limit: 200 }),
});
const driverNameById = new Map();
export function X() { return <div>{driverNameById.get("x")}</div>; }
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /listDrivers/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted bulk listDrivers did not FAIL`);
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
  console.log(`${LABEL} OK — incidents cluster has no bulk driver roster`);
}
