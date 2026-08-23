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
  api: "apps/frontend/src/api/mdata.ts",
};

function readRel(root, rel, overrides = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @param {string | null | undefined} registryOverride */
export function collectProblems(root = ROOT, registryOverride = undefined, sourceOverrides = {}) {
  const problems = [];
  const driverDetail = readRel(root, FILES.driverDetail, sourceOverrides);
  const terminateModal = readRel(root, FILES.terminateModal, sourceOverrides);
  const registry = registryOverride ?? readRel(root, FILES.registry);
  const routes = readRel(root, FILES.routes);
  const api = readRel(root, FILES.api, sourceOverrides);

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
    // FAIL-D4 / React #310 — terminationReasonOptions useMemo must run BEFORE loading/not-found early returns
    const memoIdx = code.search(/const terminationReasonOptions\s*=\s*useMemo\s*\(/);
    const earlyIdx = code.search(/if\s*\([^)]*driverQuery\.isLoading[^)]*\)/);
    if (memoIdx < 0) {
      problems.push(`${FILES.driverDetail}: missing terminationReasonOptions useMemo`);
    } else if (earlyIdx < 0) {
      problems.push(`${FILES.driverDetail}: missing driverQuery.isLoading early return (guard anchor)`);
    } else if (memoIdx > earlyIdx) {
      problems.push(
        `${FILES.driverDetail}: terminationReasonOptions useMemo after driverQuery.isLoading early return (React hooks #310)`,
      );
    }
    // FAIL-D5 — partial form patch must MERGE over driver defaults (date click must not blank identity)
    if (/Object\.keys\(\s*form\s*\)\.length\s*>\s*0\s*\)\s*return\s*form/.test(code)) {
      problems.push(
        `${FILES.driverDetail}: FAIL-D5 — hydratedForm must not return partial form when Object.keys(form).length > 0`,
      );
    }
    if (!/\{\s*\.\.\.driverFormDefaults\s*,\s*\.\.\.form\s*\}/.test(code)) {
      problems.push(
        `${FILES.driverDetail}: FAIL-D5 — hydratedForm must merge {...driverFormDefaults, ...form}`,
      );
    }
    if (!/queryKey:\s*\["driver-termination-reasons", companyId\]/.test(code) || !/listTerminationReasons\(companyId, false\)/.test(code)) {
      problems.push(`${FILES.driverDetail}: termination-reason GET must bind the selected company`);
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
    if (!/reasonsQ\.isError[\s\S]{0,500}<ListErrorState[\s\S]{0,300}reasonsQ\.refetch\(\)/.test(code)) {
      problems.push(`${FILES.terminateModal}: failed termination-reason GET must expose exact retry`);
    }
    if (!/disabled=\{reasonsQ\.isError\}/.test(code) || !/if \(reasonsQ\.isError\)/.test(code)) {
      problems.push(`${FILES.terminateModal}: terminate action must fail closed while reasons are unavailable`);
    }
    if (!/queryKey:\s*\["driver-termination-reasons", operatingCompanyId\]/.test(code) || !/listTerminationReasons\(operatingCompanyId\)/.test(code)) {
      problems.push(`${FILES.terminateModal}: termination-reason GET must bind the selected company`);
    }
  }

  if (!api) problems.push(`missing ${FILES.api}`);
  else {
    const listReasonsBlock = api.match(/export function listTerminationReasons[\s\S]{0,500}?\n\}/)?.[0] ?? "";
    if (!/listTerminationReasons\(operatingCompanyId: string, includeInactive = false\)/.test(listReasonsBlock) ||
        !/new URLSearchParams\(\{ operating_company_id: operatingCompanyId \}\)/.test(listReasonsBlock)) {
      problems.push(`${FILES.api}: listTerminationReasons must send explicit operating_company_id`);
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

  const modal = readRel(ROOT, FILES.terminateModal);
  for (const [name, next, expected] of [
    ["retry removed", modal.replace("reasonsQ.refetch()", "reasonRetryRemoved()"), "exact retry"],
    ["fail closed removed", modal.replace("disabled={reasonsQ.isError}", "disabled={false}"), "fail closed"],
  ]) {
    const problems = collectProblems(ROOT, undefined, { [FILES.terminateModal]: next });
    if (next === modal || !problems.some((p) => p.includes(expected))) {
      console.error(`${LABEL} SELFTEST FAIL: ${name} mutation escaped`);
      process.exit(1);
    }
  }
  for (const [name, rel, next, expected] of [
    ["modal company scope removed", FILES.terminateModal, modal.replace("listTerminationReasons(operatingCompanyId)", "listTerminationReasons(\"\")"), "selected company"],
    ["detail company scope removed", FILES.driverDetail, readRel(ROOT, FILES.driverDetail).replace("listTerminationReasons(companyId, false)", "listTerminationReasons(\"\", false)"), "selected company"],
    ["API company scope removed", FILES.api, readRel(ROOT, FILES.api).replace(/(export function listTerminationReasons[\s\S]{0,160}?)new URLSearchParams\(\{ operating_company_id: operatingCompanyId \}\)/, "$1new URLSearchParams()"), "explicit operating_company_id"],
  ]) {
    const problems = collectProblems(ROOT, undefined, { [rel]: next });
    if (!problems.some((p) => p.includes(expected))) {
      console.error(`${LABEL} SELFTEST FAIL: ${name} mutation escaped`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} SELFTEST OK — 6 planted defects caught`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — driver termination reason inline create (DriverDetail + TerminateConfirmModal)`);
}
