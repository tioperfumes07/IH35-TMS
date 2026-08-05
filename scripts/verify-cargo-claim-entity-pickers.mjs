#!/usr/bin/env node
/**
 * Cargo claim intake — load/driver/unit/trailer must use EntityPicker (not Combobox roster pages).
 * Cursor even claim: 2392.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cargo-claim-entity-pickers";
const TARGET = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const kind of ["load", "driver", "unit", "trailer"]) {
    if (!new RegExp(`kind=["']${kind}["']`).test(code)) {
      problems.push(`${TARGET}: missing EntityPicker kind=${kind}`);
    }
  }
  if (/from ["'].*Combobox["']/.test(src) || /<Combobox[\s>]/.test(code)) {
    problems.push(`${TARGET}: must not import/use Combobox for entity fields`);
  }
  if (/CreateDriverModal/.test(src)) {
    problems.push(`${TARGET}: driver create must be EntityPicker allowCreate, not CreateDriverModal side channel`);
  }
  if (/listDrivers|listUnits\(/.test(code)) {
    problems.push(`${TARGET}: must not local-fetch driver/unit roster for form pickers`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "x";
    import { CreateDriverModal } from "y";
    listDrivers({}); listUnits({});
    <Combobox options={loads} />
  `;
  const good = `
    <EntityPicker kind="load" />
    <EntityPicker kind="driver" allowCreate />
    <EntityPicker kind="unit" />
    <EntityPicker kind="trailer" />
  `;
  if (collectProblems(bad).length < 2 || collectProblems(good).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: collectProblems(bad), good: collectProblems(good) });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Cargo claim load/driver/unit/trailer use EntityPicker`);
