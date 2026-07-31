#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — LaborTracker labor code must use ReferenceSelect with
 * createKind=maintenance_labor_code (same-table write to catalogs.maintenance_labor_codes).
 * fuel_card_type has zero persistable consumers on main — this is the next NON-FIN bare picker.
 * Cursor even claim: 1850.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-maintenance-labor-code-inline-create";

const TRACKER = "apps/frontend/src/components/maintenance/LaborTracker.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const FACTORY = "apps/backend/src/catalogs/maintenance/factory.ts";
const INDEX = "apps/backend/src/catalogs/maintenance/index.ts";

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
  const tracker = readRel(root, TRACKER, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  const factory = readRel(root, FACTORY, overrides);
  const index = readRel(root, INDEX, overrides);

  if (!tracker) problems.push(`missing ${TRACKER}`);
  else {
    const code = tracker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']maintenance_labor_code["']/.test(code)) {
      problems.push(`${TRACKER}: labor code must use createKind=maintenance_labor_code`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${TRACKER}: must import/use ReferenceSelect`);
    }
    if (/Labor code[\s\S]{0,400}<SelectCombobox[\s\S]{0,200}laborCodeId/.test(code)) {
      problems.push(`${TRACKER}: must not keep SelectCombobox dual path for labor code`);
    }
    if (!/labor-codes/.test(code)) {
      problems.push(`${TRACKER}: must invalidate maintenance labor-codes query on inline create`);
    }
    if (!/labor_code_id/.test(code)) {
      problems.push(`${TRACKER}: must persist labor_code_id on time entries`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/maintenance_labor_code:\s*catalogEntry\(/.test(registry)) {
      problems.push(`${REGISTRY}: missing maintenance_labor_code catalogEntry`);
    }
    if (!/catalogs\.maintenance_labor_codes/.test(registry)) {
      problems.push(`${REGISTRY}: must declare catalogs.maintenance_labor_codes`);
    }
    if (!/\/api\/v1\/catalogs\/maintenance\/labor-codes/.test(registry)) {
      problems.push(`${REGISTRY}: must POST maintenance/labor-codes`);
    }
    if (/listMaintenanceLaborCodes/.test(registry)) {
      problems.push(`${REGISTRY}: must not contain listMaintenanceLaborCodes literal (selftest landmine)`);
    }
  }

  if (!factory) problems.push(`missing ${FACTORY}`);
  else if (
    !/FROM catalogs\.\$\{config\.tableName\}/.test(factory) ||
    !/INSERT INTO catalogs\.\$\{config\.tableName\}/.test(factory)
  ) {
    problems.push(`${FACTORY}: must SELECT+INSERT catalogs.\${tableName} (VERIFY-2 cl.5)`);
  }

  if (!index) problems.push(`missing ${INDEX}`);
  else if (!/maintenance_labor_codes/.test(index)) {
    problems.push(`${INDEX}: must register maintenance_labor_codes catalog`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const expectCaught = (name, rel, mutator, needle) => {
    const live = readRel(ROOT, rel);
    if (!live) {
      failures.push(`${name}: missing ${rel}`);
      return;
    }
    const mutated = mutator(live);
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = collectProblems(ROOT, { [rel]: mutated });
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "tracker-createKind-removed",
    TRACKER,
    (s) => s.replace(/createKind=["']maintenance_labor_code["']/, 'createKind="vendor"'),
    "createKind=maintenance_labor_code"
  );
  expectCaught(
    "tracker-selectcombobox-restored",
    TRACKER,
    (s) => s.replace(/createKind=["']maintenance_labor_code["']/, ""),
    "createKind=maintenance_labor_code"
  );
  expectCaught(
    "registry-entry-removed",
    REGISTRY,
    (s) => s.replace(/maintenance_labor_code:\s*catalogEntry\([\s\S]{0,400}\}\),/, ""),
    "missing maintenance_labor_code catalogEntry"
  );
  expectCaught(
    "factory-insert-removed",
    FACTORY,
    (s) => s.replace(/INSERT INTO catalogs\.\$\{config\.tableName\}/, "INSERT INTO catalogs.retire_table"),
    "SELECT+INSERT catalogs.\${tableName}"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 4 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — LaborTracker maintenance labor code inline create`);
}
