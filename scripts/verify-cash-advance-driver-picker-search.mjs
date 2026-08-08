#!/usr/bin/env node
/**
 * CreateAdvanceModal driver must use DriverPickerWithCreate (server search) — not Combobox over
 * listDrivers(search:"", limit:200). Cursor even claim: 2102.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advance-driver-picker-search";
const FILE = "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx";

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

  if (!/DriverPickerWithCreate/.test(code)) {
    problems.push(`${FILE}: must use DriverPickerWithCreate for driver`);
  }
  const hasTrailerPicker =
    (/EntityPicker/.test(code) && /kind=["']trailer["']/.test(code)) ||
    (/trailerSearch/.test(code) && /onSearch=\{setTrailerSearch\}/.test(code));
  if (!hasTrailerPicker) {
    problems.push(`${FILE}: trailer must use EntityPicker kind=trailer OR trailerSearch → onSearch`);
  }
  const hasLoadPicker =
    (/EntityPicker/.test(code) && /kind=["']load["']/.test(code)) ||
    (/loadSearch/.test(code) &&
      /onSearch=\{setLoadSearch\}/.test(code) &&
      /search:\s*loadSearch\s*\|\|\s*undefined/.test(code));
  if (!hasLoadPicker) {
    problems.push(
      `${FILE}: load must use EntityPicker kind=load OR Combobox loadSearch → onSearch + listLoads search`
    );
  }
  if (!(/EntityPicker/.test(code) && /kind=["']unit["']/.test(code))) {
    problems.push(`${FILE}: unit must use EntityPicker kind=unit`);
  }
  if (/listDrivers\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listDrivers (capped roster)`);
  }
  // FAIL-CA1: cash-advance money picker must include Probation (create default), not Active-only.
  if (!/driverRoster=["']active_or_probation["']/.test(code)) {
    problems.push(
      `${FILE}: FAIL-CA1 — DriverPickerWithCreate must pass driverRoster="active_or_probation" (Probation create default)`
    );
  }
  const registry = readRel(root, "apps/frontend/src/components/parity/entityPickerRegistry.ts");
  if (registry && !/active_or_probation/.test(registry)) {
    problems.push(
      "entityPickerRegistry.ts: driver list must support driverRoster active_or_probation (FAIL-CA1)"
    );
  }
  if (registry && !/\["Active",\s*"Probation"\]/.test(registry) && !/\('Active',\s*'Probation'\)/.test(registry)) {
    problems.push(
      'entityPickerRegistry.ts: money roster must fetch Active+Probation (FAIL-CA1)'
    );
  }
  if (/search:\s*""/.test(code)) {
    problems.push(`${FILE}: must not hardcode search:""`);
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet page`);
  }
  if (/driverOptions/.test(code) && /Combobox[\s\S]{0,80}driverOptions/.test(code)) {
    problems.push(`${FILE}: must not keep Combobox dual path over driverOptions`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-cash-advance-driver-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/cash-advances/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "CreateAdvanceModal.tsx"),
      `import { listDrivers } from "../../../api/mdata";
const driversQuery = useQuery({
  queryFn: () => listDrivers({ search: "", limit: 200 }),
});
const driverOptions = [];
export function X() {
  return <Combobox options={driverOptions} />;
}
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /DriverPickerWithCreate|listDrivers/.test(p))) {
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
  console.log(`${LABEL} OK — CreateAdvanceModal uses DriverPickerWithCreate`);
}
