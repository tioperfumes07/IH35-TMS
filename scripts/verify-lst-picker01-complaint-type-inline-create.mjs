#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — ComplaintsTab type must use ReferenceSelect with
 * createKind=complaint_type (same-table write to catalogs.complaint_types).
 * Cursor even claim: 1818.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-complaint-type-inline-create";

const TAB = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/complaint-types.routes.ts";

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
    if (!/createKind=["']complaint_type["']/.test(code)) {
      problems.push(`${TAB}: complaint type must use createKind=complaint_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${TAB}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']code["']/.test(code)) {
      problems.push(`${TAB}: must select by type_code (createdValueField=code)`);
    }
    if (/<SelectCombobox[\s\S]{0,280}complaint_type|complaintTypesQuery\.data\?\.rows[\s\S]{0,120}<option/.test(code)) {
      problems.push(`${TAB}: must not keep SelectCombobox dual path for complaint type`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/complaint_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing complaint_type entry`);
    }
    if (!/writeTable:\s*"catalogs\.complaint_types"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.complaint_types`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/complaint-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/complaint-types`);
    }
    if (!/type_code/.test(registry) || !/type_name/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST type_code + type_name`);
    }
    // Do not put listComplaintTypes in evidence — breaks safety-catalog-bound selftest patterns.
    if (/listComplaintTypes/.test(registry)) {
      problems.push(`${REGISTRY}: must not contain listComplaintTypes literal (selftest landmine)`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/INSERT INTO catalogs\.complaint_types/.test(routes) || !/FROM catalogs\.complaint_types/.test(routes)) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.complaint_types (VERIFY-2 cl.5)`);
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
  console.log(`${LABEL} OK — ComplaintsTab complaint type inline create`);
}
