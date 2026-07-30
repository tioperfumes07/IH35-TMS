#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — FineCreateModal violation type must use ReferenceSelect with
 * createKind=civil_fine_type (same-table write to catalogs.civil_fine_types).
 * Cursor even claim: 1812.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-civil-fine-type-inline-create";

const MODAL = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/civil-fine-types.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
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
    if (!/createKind=["']civil_fine_type["']/.test(modal)) {
      problems.push(`${MODAL}: violation type must use createKind=civil_fine_type`);
    }
    if (!/ReferenceSelect/.test(modal)) {
      problems.push(`${MODAL}: must import/use ReferenceSelect for civil fine type`);
    }
    // External allowAddNew side-channel create is the dual-path this kills.
    if (/allowAddNew[\s\S]{0,200}createTypeMutation|createCivilFineType\(/.test(modal)) {
      problems.push(`${MODAL}: must not keep Combobox allowAddNew / createCivilFineType dual path`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/civil_fine_type:\s*catalogEntry\(/.test(registry) && !/civil_fine_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing civil_fine_type entry`);
    }
    if (!/catalogs\.civil_fine_types/.test(registry)) {
      problems.push(`${REGISTRY}: must declare catalogs.civil_fine_types`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/civil-fine-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/civil-fine-types`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/INSERT INTO catalogs\.civil_fine_types/.test(routes) || !/FROM catalogs\.civil_fine_types/.test(routes)) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.civil_fine_types (VERIFY-2 cl.5)`);
  }

  return problems;
}

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
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
  console.log(`${LABEL} OK — FineCreateModal civil fine type inline create`);
}
