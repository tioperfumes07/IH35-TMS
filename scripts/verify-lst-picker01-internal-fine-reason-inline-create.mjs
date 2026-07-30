#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — InternalFinesPage reason must use ReferenceSelect with
 * createKind=internal_fine_reason (same-table write to catalogs.internal_fine_reasons).
 * Cursor even claim: 1820.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-internal-fine-reason-inline-create";

const PAGE = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/safety/internal-fine-reasons.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const page = readRel(root, PAGE);
  const registry = readRel(root, REGISTRY);
  const routes = readRel(root, ROUTES);

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']internal_fine_reason["']/.test(code)) {
      problems.push(`${PAGE}: reason must use createKind=internal_fine_reason`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${PAGE}: must import/use ReferenceSelect`);
    }
    if (/ADD_REASON_SENTINEL|internal-fine-reason-create-modal/.test(code)) {
      problems.push(`${PAGE}: must not keep SelectCombobox sentinel / external Modal dual path`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/internal_fine_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing internal_fine_reason entry`);
    }
    if (!/writeTable:\s*"catalogs\.internal_fine_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.internal_fine_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/safety\/internal-fine-reasons/.test(registry)) {
      problems.push(`${REGISTRY}: must POST safety/internal-fine-reasons`);
    }
    if (!/reason_code/.test(registry) || !/default_amount/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST reason_code + default_amount`);
    }
    if (/listInternalFineReasons/.test(registry)) {
      problems.push(`${REGISTRY}: must not contain listInternalFineReasons literal (selftest landmine)`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (
    !/INSERT INTO catalogs\.internal_fine_reasons/.test(routes) ||
    !/FROM catalogs\.internal_fine_reasons/.test(routes)
  ) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.internal_fine_reasons (VERIFY-2 cl.5)`);
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
  console.log(`${LABEL} OK — InternalFinesPage internal fine reason inline create`);
}
