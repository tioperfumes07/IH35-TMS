#!/usr/bin/env node
/**
 * SAF-FINE-CATALOG — External Fine create must require catalogs.civil_fine_types
 * (civil_fine_type_id), not free-text-only creates that leave the FK null.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";
const LABEL = "verify-safety-fine-civil-catalog-required";

export function collectProblems(src) {
  const problems = [];
  if (!/listCivilFineTypes/.test(src)) {
    problems.push(`${TARGET}: must load catalogs via listCivilFineTypes`);
  }
  if (!/ReferenceSelect/.test(src) || !/createKind=\"civil_fine_type\"/.test(src)) {
    problems.push(`${TARGET}: must use ReferenceSelect createKind=civil_fine_type`);
  }
  if (!/Violation type \(catalog\) \*/.test(src)) {
    problems.push(`${TARGET}: catalog field must be labelled required (*)`);
  }
  if (!/Violation type \(catalog\) is required/.test(src)) {
    problems.push(`${TARGET}: must throw when civilFineTypeId missing`);
  }
  if (!/canSubmit/.test(src) || !/disabled=\{!canSubmit\}/.test(src)) {
    problems.push(`${TARGET}: Create Fine must stay disabled until catalog type selected`);
  }
  if (!/civil_fine_type_id: civilFineTypeId/.test(src)) {
    problems.push(`${TARGET}: submit payload must send civil_fine_type_id`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const goodP = collectProblems(good);
  if (goodP.length) {
    console.error(`${LABEL} --selftest FAIL good:\n${goodP.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  const bad = good
    .replace("Violation type (catalog) *", "Violation type (catalog)")
    .replace("Violation type (catalog) is required", "missing")
    .replace("disabled={!canSubmit}", "disabled={false}");
  if (collectProblems(bad).length < 2) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const problems = collectProblems(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Fine create requires catalog civil_fine_type_id`);
}
