#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — HosViolationCreateModal must use ReferenceSelect createKind=dot_violation_type
 * (same catalog as HOSViolationsTab). Kills free-text dual path on HoursOfServicePage drawer.
 * Cursor even claim: 1824.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-hos-create-modal-dot-type-inline-create";

const MODAL = "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx";
const PAGE = "apps/frontend/src/pages/safety/HoursOfServicePage.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const modal = readRel(root, MODAL);
  const page = readRel(root, PAGE);
  const registry = readRel(root, REGISTRY);

  if (!modal) problems.push(`missing ${MODAL}`);
  else {
    const code = modal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']dot_violation_type["']/.test(code)) {
      problems.push(`${MODAL}: must use createKind=dot_violation_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${MODAL}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']code["']/.test(code)) {
      problems.push(`${MODAL}: must select by violation_code (createdValueField=code)`);
    }
    if (!/dot_violation_type_id/.test(code)) {
      problems.push(`${MODAL}: create payload must send dot_violation_type_id (LST-LINK-02)`);
    }
    if (!/listDotViolationTypes/.test(code)) {
      problems.push(`${MODAL}: must list catalogs.dot_violation_types`);
    }
    if (/placeholder=["']e\.g\. 11_HOUR["']/.test(code) || /id=["']hos-vio-type["'][\s\S]{0,200}<input/.test(code)) {
      problems.push(`${MODAL}: must not keep free-text violation type dual path`);
    }
  }

  if (!page) problems.push(`missing ${PAGE}`);
  else if (!/HosViolationCreateModal/.test(page)) {
    problems.push(`${PAGE}: must mount HosViolationCreateModal (active path)`);
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else if (!/dot_violation_type:\s*\{/.test(registry) || !/writeTable:\s*"catalogs\.dot_violation_types"/.test(registry)) {
    problems.push(`${REGISTRY}: missing dot_violation_type same-table write`);
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
  console.log(`${LABEL} OK — HosViolationCreateModal DOT type inline create`);
}
