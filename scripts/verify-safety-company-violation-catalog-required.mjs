#!/usr/bin/env node
/**
 * SAF-F15 — Company Violation create must require catalogs.company_violation_types
 * (violation_type_uuid), not enum-only / free-text creates that leave the FK null.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx";
const LABEL = "verify-safety-company-violation-catalog-required";

export function collectProblems(src) {
  const problems = [];
  if (!/listCompanyViolationTypes/.test(src)) {
    problems.push(`${TARGET}: must load catalogs via listCompanyViolationTypes`);
  }
  if (!/ReferenceSelect/.test(src) || !/createKind=\"company_violation_type\"/.test(src)) {
    problems.push(`${TARGET}: must use ReferenceSelect createKind=company_violation_type`);
  }
  if (!/Violation type \(catalog\) \*/.test(src)) {
    problems.push(`${TARGET}: catalog field must be labelled required (*)`);
  }
  if (!/Violation type \(catalog\) is required/.test(src)) {
    problems.push(`${TARGET}: must throw when violation_type_uuid missing`);
  }
  if (!/canSubmit/.test(src) || !/disabled=\{!canSubmit\}/.test(src)) {
    problems.push(`${TARGET}: Save must stay disabled until catalog type selected`);
  }
  if (!/violation_type_uuid: violationTypeUuid/.test(src)) {
    problems.push(`${TARGET}: submit payload must send violation_type_uuid`);
  }
  // Enum axis OK if demoted — forbid presenting enum as the only "Violation type" primary
  if (/<label[^>]*>Violation type<\/label>/.test(src) && !/Source category/.test(src)) {
    problems.push(`${TARGET}: enum must not be the primary "Violation type" label (use Source category)`);
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
  console.log(`${LABEL} PASS — Company Violation create requires catalog violation_type_uuid`);
}
