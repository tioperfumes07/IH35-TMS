#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — Fuel planner ExpensiveStatesMultiselect must use ReferenceSelect with
 * createKind=fuel_expensive_state (same-table write to catalogs.expensive_states).
 * Cursor even claim: 1856.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-fuel-expensive-state-inline-create";

const MULTI = "apps/frontend/src/pages/fuel/components/ExpensiveStatesMultiselect.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const FACTORY = "apps/backend/src/catalogs/fuel/factory.ts";
const INDEX = "apps/backend/src/catalogs/fuel/index.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const multi = readRel(root, MULTI, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  const factory = readRel(root, FACTORY, overrides);
  const index = readRel(root, INDEX, overrides);

  if (!multi) problems.push(`missing ${MULTI}`);
  else {
    const code = multi.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']fuel_expensive_state["']/.test(code)) {
      problems.push(`${MULTI}: must use createKind=fuel_expensive_state`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${MULTI}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']code["']/.test(code)) {
      problems.push(`${MULTI}: must select by code (createdValueField=code)`);
    }
    if (!/expensiveStatesCatalogClient/.test(code)) {
      problems.push(`${MULTI}: must list from expensiveStatesCatalogClient (same table as POST)`);
    }
    if (!/invalidateQueries|refetch/.test(code)) {
      problems.push(`${MULTI}: must invalidate/refetch expensive-states query after inline create`);
    }
    if (/Manage Expensive States catalog|\/lists\/fuel\/expensive-states/.test(multi)) {
      problems.push(`${MULTI}: must not keep Lists-only management link`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/fuel_expensive_state:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing fuel_expensive_state entry`);
    }
    if (!/catalogs\.expensive_states/.test(registry)) {
      problems.push(`${REGISTRY}: must declare catalogs.expensive_states`);
    }
    if (!/\/api\/v1\/catalogs\/fuel\/expensive-states/.test(registry)) {
      problems.push(`${REGISTRY}: must POST fuel/expensive-states`);
    }
  }

  if (!factory) problems.push(`missing ${FACTORY}`);
  else if (
    !/FROM catalogs\.\$\{config\.tableName\}/.test(factory) ||
    !/INSERT INTO catalogs\.\$\{config\.tableName\}/.test(factory)
  ) {
    problems.push(`${FACTORY}: fuel catalog factory must SELECT+INSERT catalogs.\${tableName} (VERIFY-2 cl.5)`);
  }

  if (!index) problems.push(`missing ${INDEX}`);
  else if (!/expensive_states/.test(index)) {
    problems.push(`${INDEX}: must register expensive_states catalog`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const multi = readRel(ROOT, MULTI);
  const brokenKind = multi.replace(/createKind=["']fuel_expensive_state["']/, 'createKind="vendor"');
  const kindProblems = collectProblems(ROOT, { [MULTI]: brokenKind });
  if (kindProblems.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: planted createKind=vendor mutation did not fail`);
    process.exit(1);
  }

  const brokenClient = multi.replace(/expensiveStatesCatalogClient/g, "fuelCardTypesCatalogClient");
  const clientProblems = collectProblems(ROOT, { [MULTI]: brokenClient });
  if (clientProblems.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: planted catalog client mutation did not fail`);
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
  console.log(`${LABEL} OK — Fuel planner expensive state inline create → catalogs.expensive_states`);
}
