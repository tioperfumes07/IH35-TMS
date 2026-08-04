#!/usr/bin/env node
/**
 * M-18 — Create WO Load # / Breakdown Load must use EntityPicker kind=load (mdata.loads).
 * Raw UUID text inputs are forbidden for the G18-critical load FK.
 * Cursor even claim: 2386.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-create-wo-load-entity-picker";
const TARGET = "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/data-testid=["']wo-load-entity-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=wo-load-entity-picker`);
  }
  if (!/data-testid=["']wo-breakdown-load-entity-picker["']/.test(src)) {
    problems.push(`${TARGET}: missing data-testid=wo-breakdown-load-entity-picker`);
  }
  if (!/EntityPicker[\s\S]*?kind=["']load["'][\s\S]*?load_id/.test(code) && !/kind=["']load["'][\s\S]*?["']load_id["']/.test(code)) {
    // Accept either order: kind=load near load_id setter
    if (!/kind=["']load["']/.test(code) || !/setValue\(["']load_id["']/.test(code)) {
      problems.push(`${TARGET}: load_id must wire EntityPicker kind=load + setValue("load_id")`);
    }
  }
  if (!/kind=["']load["']/.test(code) || !/setValue\(["']roadside_breakdown_load_id["']/.test(code)) {
    problems.push(`${TARGET}: roadside_breakdown_load_id must wire EntityPicker kind=load`);
  }
  // Forbid a bare text register on load_id as the primary control when EntityPicker path is present —
  // allow hidden register + EntityPicker. Fail if the only load_id control is a visible text input
  // without the testid wrapper (heuristic: register("load_id") without wo-load-entity-picker).
  if (/register\(["']load_id["']/.test(code) && !/wo-load-entity-picker/.test(src)) {
    problems.push(`${TARGET}: load_id still raw register without EntityPicker wrapper`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    <Field label="Load">
      <input {...register("load_id")} />
    </Field>
    <Field label="Breakdown">
      <input {...register("roadside_breakdown_load_id")} />
    </Field>`;
  const good = `
    <div data-testid="wo-load-entity-picker">
      <input type="hidden" {...register("load_id")} />
      <EntityPicker kind="load" onChange={(v) => setValue("load_id", v ?? "")} />
    </div>
    <div data-testid="wo-breakdown-load-entity-picker">
      <EntityPicker kind="load" onChange={(v) => setValue("roadside_breakdown_load_id", v ?? "")} />
    </div>`;
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
console.log(`${LABEL} OK — Create WO load + breakdown load use EntityPicker kind=load`);
