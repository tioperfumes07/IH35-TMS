#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — HOSViolationsTab violation type must use ReferenceSelect with
 * createKind=dot_violation_type (same-table write to catalogs.dot_violation_types).
 * Cursor even claim: 1816.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-dot-violation-type-inline-create";

const TAB = "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/dot-violation-types.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const tab = readRel(root, TAB);
  const registry = readRel(root, REGISTRY);
  const routes = readRel(root, ROUTES);

  if (!tab) problems.push(`missing ${TAB}`);
  else {
    const code = tab.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']dot_violation_type["']/.test(code)) {
      problems.push(`${TAB}: violation type must use createKind=dot_violation_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${TAB}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']code["']/.test(code)) {
      problems.push(`${TAB}: must select by violation_code (createdValueField=code)`);
    }
    if (/<Combobox[\s\S]{0,200}violation_type|allowAddNew/.test(code)) {
      problems.push(`${TAB}: must not keep bare Combobox dual path for violation type`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/dot_violation_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing dot_violation_type entry`);
    }
    if (!/writeTable:\s*"catalogs\.dot_violation_types"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.dot_violation_types`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/dot-violation-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/dot-violation-types`);
    }
    if (!/violation_code/.test(registry) || !/hours_of_service/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST violation_code + hours_of_service basic_category`);
    }
    // Do not put listDotViolationTypes in evidence — breaks safety-catalog-bound selftest.
    if (/listDotViolationTypes/.test(registry)) {
      problems.push(`${REGISTRY}: must not contain listDotViolationTypes literal (selftest landmine)`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/INSERT INTO catalogs\.dot_violation_types/.test(routes) || !/FROM catalogs\.dot_violation_types/.test(routes)) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.dot_violation_types (VERIFY-2 cl.5)`);
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
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — HOSViolationsTab DOT violation type inline create`);
}
