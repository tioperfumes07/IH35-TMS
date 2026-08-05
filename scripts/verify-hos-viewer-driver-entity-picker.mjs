#!/usr/bin/env node
/**
 * HosViewerSection driver must use EntityPicker (kind=driver),
 * not Combobox over listDrivers. Cursor even claim: 2408.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-viewer-driver-entity-picker";
const TARGET = "apps/frontend/src/pages/compliance/HosViewerSection.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/data-testid=["']hos-viewer-driver-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=hos-viewer-driver-picker`);
  }
  if (!/kind=["']driver["']/.test(code) || !/setDriverId/.test(code)) {
    problems.push(`${TARGET}: driver must use EntityPicker kind=driver`);
  }
  if (/listDrivers\(/.test(code)) {
    problems.push(`${TARGET}: must not local-fetch driver roster — EntityPicker owns search`);
  }
  if (/from ["'].*\/Combobox["']/.test(src) || /<Combobox[\s\S]{0,200}driverId/.test(code)) {
    problems.push(`${TARGET}: Combobox must not remain on driver picker`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "../../components/Combobox";
    listDrivers({})
    <Combobox options={options} value={driverId} onChange={setDriverId} />
  `;
  const good = `
    <div data-testid="hos-viewer-driver-picker">
      <EntityPicker kind="driver" onChange={setDriverId} />
    </div>
  `;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 2 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
const src = fs.readFileSync(abs, "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — HOS Viewer driver uses EntityPicker`);
