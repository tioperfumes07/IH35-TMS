#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — LaborTracker labor code must use ReferenceSelect with
 * createKind=maintenance_labor_code (POST catalogs.maintenance_labor_codes; persists labor_code_id).
 * Cursor even claim: 1852.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-maintenance-labor-code-inline-create";

const TRACKER = "apps/frontend/src/components/maintenance/LaborTracker.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const FACTORY = "apps/backend/src/catalogs/maintenance/factory.ts";
const LABOR_ROUTES = "apps/backend/src/maintenance/labor.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const tracker = readRel(root, TRACKER);
  const registry = readRel(root, REGISTRY);
  const factory = readRel(root, FACTORY);
  const laborRoutes = readRel(root, LABOR_ROUTES);

  if (!tracker) problems.push(`missing ${TRACKER}`);
  else {
    const code = tracker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']maintenance_labor_code["']/.test(code)) {
      problems.push(`${TRACKER}: labor code must use createKind=maintenance_labor_code`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${TRACKER}: must import/use ReferenceSelect for labor code`);
    }
    if (!/labor_code_id/.test(code)) {
      problems.push(`${TRACKER}: must persist labor_code_id on start/manual mutations`);
    }
    if (/Labor code[\s\S]{0,160}SelectCombobox/.test(code)) {
      problems.push(`${TRACKER}: must not keep SelectCombobox for labor code picker`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/maintenance_labor_code:\s*catalogEntry\(\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing maintenance_labor_code catalogEntry`);
    }
    if (!/maintenance_labor_code:[\s\S]{0,420}table:\s*"catalogs\.maintenance_labor_codes"/.test(registry)) {
      problems.push(`${REGISTRY}: maintenance_labor_code must read/write catalogs.maintenance_labor_codes`);
    }
    if (!/\/api\/v1\/catalogs\/maintenance\/labor-codes/.test(registry)) {
      problems.push(`${REGISTRY}: must POST catalogs/maintenance/labor-codes`);
    }
  }

  if (!factory) problems.push(`missing ${FACTORY}`);
  else if (!/FROM catalogs\.\$\{config\.tableName\}/.test(factory) || !/INSERT INTO catalogs\.\$\{config\.tableName\}/.test(factory)) {
    problems.push(`${FACTORY}: must SELECT+INSERT catalogs.\${config.tableName} (VERIFY-2 cl.5)`);
  }

  if (!laborRoutes) problems.push(`missing ${LABOR_ROUTES}`);
  else if (!/FROM catalogs\.maintenance_labor_codes/.test(laborRoutes)) {
    problems.push(`${LABOR_ROUTES}: labor picker list must read catalogs.maintenance_labor_codes`);
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
  const tracker = readRel(ROOT, TRACKER);
  const broken = tracker.replace(/createKind=["']maintenance_labor_code["']/, 'createKind="vendor"');
  if (!/createKind=["']vendor["']/.test(broken)) {
    console.error(`${LABEL} SELFTEST FAIL: could not plant createKind mutation`);
    process.exit(1);
  }
  if (/createKind=["']maintenance_labor_code["']/.test(broken)) {
    console.error(`${LABEL} SELFTEST FAIL: planted mutation still has maintenance_labor_code`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, TRACKER), broken);
  const planted = collectProblems();
  fs.writeFileSync(path.join(ROOT, TRACKER), tracker);
  if (!planted.some((p) => /createKind=maintenance_labor_code/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: planted createKind mutation did not fail guard`);
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
  console.log(`${LABEL} OK — LaborTracker maintenance_labor_code inline create`);
}
