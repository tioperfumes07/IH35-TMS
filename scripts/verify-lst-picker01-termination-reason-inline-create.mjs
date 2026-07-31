#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — DriverDetail + TerminateConfirmModal termination reason must use
 * ReferenceSelect with createKind=driver_termination_reason (same-table write to
 * catalogs.driver_termination_reasons). Cursor even claim: 1838.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-termination-reason-inline-create";

const FILES = {
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  terminateModal: "apps/frontend/src/components/drivers/TerminateConfirmModal.tsx",
  registry: "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
  routes: "apps/backend/src/mdata/driver-safety-events.routes.ts",
};

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @param {string | null | undefined} registryOverride */
export function collectProblems(root = ROOT, registryOverride = undefined) {
  const problems = [];
  const driverDetail = readRel(root, FILES.driverDetail);
  const terminateModal = readRel(root, FILES.terminateModal);
  const registry = registryOverride ?? readRel(root, FILES.registry);
  const routes = readRel(root, FILES.routes);

  if (!driverDetail) problems.push(`missing ${FILES.driverDetail}`);
  else {
    const code = driverDetail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']driver_termination_reason["']/.test(code)) {
      problems.push(`${FILES.driverDetail}: termination reason must use createKind=driver_termination_reason`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${FILES.driverDetail}: must import/use ReferenceSelect for termination reason`);
    }
    if (/Add reason in catalog|from termination reasons catalog/.test(driverDetail)) {
      problems.push(`${FILES.driverDetail}: must not toast fake "Add reason in catalog"`);
    }
    if (/allowAddNew[\s\S]{0,200}termination reasons catalog/.test(driverDetail)) {
      problems.push(`${FILES.driverDetail}: must not keep Combobox allowAddNew toast-only path`);
    }
  }

  if (!terminateModal) problems.push(`missing ${FILES.terminateModal}`);
  else {
    const code = terminateModal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']driver_termination_reason["']/.test(code)) {
      problems.push(`${FILES.terminateModal}: must use createKind=driver_termination_reason`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${FILES.terminateModal}: must import/use ReferenceSelect`);
    }
    if (/<Combobox[\s\S]{0,120}reasonOptions/.test(code)) {
      problems.push(`${FILES.terminateModal}: must not keep bare Combobox for termination reason`);
    }
  }

  if (!registry) problems.push(`missing ${FILES.registry}`);
  else {
    if (!/driver_termination_reason:\s*\{/.test(registry)) {
      problems.push(`${FILES.registry}: missing driver_termination_reason entry`);
    }
    if (!/writeTable:\s*"catalogs\.driver_termination_reasons"/.test(registry)) {
      problems.push(`${FILES.registry}: writeTable must be catalogs.driver_termination_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/driver-termination-reasons/.test(registry)) {
      problems.push(`${FILES.registry}: must POST driver-termination-reasons`);
    }
    if (!/driver_termination_reason:[\s\S]{0,1600}create:\s*async/.test(registry)) {
      problems.push(`${FILES.registry}: driver_termination_reason must define create() POST path`);
    }
    if (!/driver_termination_reason:[\s\S]{0,1600}severity/.test(registry)) {
      problems.push(`${FILES.registry}: create must POST label + severity`);
    }
  }

  if (!routes) problems.push(`missing ${FILES.routes}`);
  else if (
    !/INSERT INTO catalogs\.driver_termination_reasons/.test(routes) ||
    !/FROM catalogs\.driver_termination_reasons/.test(routes)
  ) {
    problems.push(`${FILES.routes}: must SELECT+INSERT catalogs.driver_termination_reasons (VERIFY-2 cl.5)`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must pass):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const registry = readRel(ROOT, FILES.registry);
  const stripped = registry.replace(
    /(driver_termination_reason:\s*\{[\s\S]*?)create:\s*async[\s\S]*?\n\s*\},/m,
    "$1},"
  );
  const mutated = collectProblems(ROOT, stripped);
  if (!mutated.some((p) => p.includes("create() POST path"))) {
    console.error(`${LABEL} SELFTEST FAIL: mutation arm did not catch missing registry create()`);
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
  console.log(`${LABEL} OK — driver termination reason inline create (DriverDetail + TerminateConfirmModal)`);
}
