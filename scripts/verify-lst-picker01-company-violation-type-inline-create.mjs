#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — CompanyViolationCreateModal catalog type must use ReferenceSelect with
 * createKind=company_violation_type (same-table write to catalogs.company_violation_types).
 * Cursor even claim: 1814.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-company-violation-type-inline-create";

const MODAL = "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/company-violation-types.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const modal = readRel(root, MODAL);
  const registry = readRel(root, REGISTRY);
  const routes = readRel(root, ROUTES);

  if (!modal) problems.push(`missing ${MODAL}`);
  else {
    if (!/createKind=["']company_violation_type["']/.test(modal)) {
      problems.push(`${MODAL}: catalog type must use createKind=company_violation_type`);
    }
    if (!/ReferenceSelect/.test(modal)) {
      problems.push(`${MODAL}: must import/use ReferenceSelect`);
    }
    if (/allowAddNew|createCompanyViolationType\(|typeCreateOpen|company-violation-type-create-inline/.test(modal)) {
      problems.push(`${MODAL}: must not keep Combobox allowAddNew / external mini-create dual path`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/company_violation_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing company_violation_type entry`);
    }
    if (!/writeTable:\s*"catalogs\.company_violation_types"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.company_violation_types`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/company-violation-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/company-violation-types`);
    }
    if (!/type_code/.test(registry) || !/type_name/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST type_code + type_name`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/INSERT INTO catalogs\.company_violation_types/.test(routes) || !/FROM catalogs\.company_violation_types/.test(routes)) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.company_violation_types (VERIFY-2 cl.5)`);
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
  console.log(`${LABEL} OK — CompanyViolationCreateModal company violation type inline create`);
}
