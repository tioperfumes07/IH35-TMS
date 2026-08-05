#!/usr/bin/env node
/**
 * SafetyIncidentsClusterSurface trailer_id must use EntityPicker (kind=trailer),
 * not Combobox over listUnits trailers page. Cursor even claim: 2394.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-incident-trailer-entity-picker";
const TARGET = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/kind=["']trailer["']/.test(code) || !/setField\(["']trailer_id["']/.test(code)) {
    problems.push(`${TARGET}: trailer_id must use EntityPicker kind=trailer`);
  }
  if (/Combobox[\s\S]{0,240}trailer_id|trailerComboboxOptions/.test(code)) {
    problems.push(`${TARGET}: trailer must not use Combobox / trailerComboboxOptions`);
  }
  if (/from ["'].*\/Combobox["']/.test(src)) {
    problems.push(`${TARGET}: Combobox import must be removed (trailer migrated)`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    import { Combobox } from "../../../components/Combobox";
    const trailerComboboxOptions = [];
    <Combobox options={trailerComboboxOptions} onChange={(next) => setField("trailer_id", next)} />
  `;
  const good = `
    <EntityPicker kind="trailer" onChange={(next) => setField("trailer_id", next ?? "")} />
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
console.log(`${LABEL} OK — incident trailer uses EntityPicker`);
