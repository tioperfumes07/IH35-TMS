#!/usr/bin/env node
/**
 * SAF-F14 / S-A16 / SAF-F26 — AccidentsPage list filters must use EntityPicker (driver + unit),
 * not raw UUID/text boxes. Filters are read-only narrowers: allowCreate={false}.
 * Cursor even claim: 2160.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-accidents-list-filters";
const FILE = "apps/frontend/src/pages/safety/AccidentsPage.tsx";

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

  if (src.includes("Filter by driver ID") || src.includes("Filter by unit ID")) {
    problems.push(`${FILE}: must not use raw UUID filter placeholders (SAF-F26)`);
  }
  if (/placeholder=["']driver_id["']/.test(code) || /placeholder=["']unit_id["']/.test(code)) {
    problems.push(`${FILE}: must not expose raw driver_id/unit_id placeholder text filters (SAF-F14)`);
  }

  const filterBar = src.match(/filterBar=\{[\s\S]*?\n\s*\}/);
  const filterSrc = filterBar ? filterBar[0] : src;
  if (/type=["']text["']/.test(filterSrc.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    problems.push(`${FILE}: filterBar must not use raw text inputs for driver/unit`);
  }

  if (!/EntityPicker/.test(filterSrc) || !/kind=["']driver["']/.test(filterSrc)) {
    problems.push(`${FILE}: filterBar must use EntityPicker kind="driver"`);
  }
  if (!/kind=["']unit["']/.test(filterSrc)) {
    problems.push(`${FILE}: filterBar must use EntityPicker kind="unit"`);
  }

  const driverPicker = filterSrc.match(/kind=["']driver["'][\s\S]*?\/>/);
  const unitPicker = filterSrc.match(/kind=["']unit["'][\s\S]*?\/>/);
  if (!driverPicker || !/allowCreate=\{false\}/.test(driverPicker[0])) {
    problems.push(`${FILE}: driver filter EntityPicker must set allowCreate={false}`);
  }
  if (!unitPicker || !/allowCreate=\{false\}/.test(unitPicker[0])) {
    problems.push(`${FILE}: unit filter EntityPicker must set allowCreate={false}`);
  }
  if (!/dataTestId=["']accidents-driver-filter["']/.test(filterSrc)) {
    problems.push(`${FILE}: driver filter must expose dataTestId=accidents-driver-filter`);
  }
  if (!/dataTestId=["']accidents-unit-filter["']/.test(filterSrc)) {
    problems.push(`${FILE}: unit filter must expose dataTestId=accidents-unit-filter`);
  }

  if (!/kind=["']driver["'][\s\S]{0,180}label=\{entityLabel\(\(row\.driver_name/.test(code)) {
    problems.push(`${FILE}: Driver column EntityLink must pass driver_name through entityLabel`);
  }
  if (!/kind=["']unit["'][\s\S]{0,180}label=\{entityLabel\(\(row\.unit_number/.test(code)) {
    problems.push(`${FILE}: Unit column EntityLink must pass unit_number through entityLabel`);
  }
  if (!/row\.driver_name/.test(code) || !/row\.unit_number/.test(code)) {
    problems.push(`${FILE}: filter logic must reference driver_name/unit_number, not uuid-only`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — live already red:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-accidents-list-filters-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/safety");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "AccidentsPage.tsx"),
      `export function AccidentsPage() {
  return (
    <ParityTable filterBar={
      <div>
        <input type="text" placeholder="Filter by driver ID" value={driverFilter} />
        <input type="text" placeholder="Filter by unit ID" value={unitFilter} />
      </div>
    } columns={[
      { key: "driver_id", render: (row) => <EntityLink kind="driver" id={row.driver_id} /> },
      { key: "unit_id", render: (row) => <EntityLink kind="unit" id={row.unit_id} /> },
    ]} />
  );
}`
    );
    const planted = collectProblems(stubRoot);
    if (planted.length < 3) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL enough (${planted.length})`);
      console.error(planted.join("\n"));
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
  console.log(`${LABEL} OK — AccidentsPage EntityPicker filters + EntityLink labels`);
}
