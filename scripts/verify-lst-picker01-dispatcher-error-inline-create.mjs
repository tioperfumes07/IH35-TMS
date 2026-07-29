#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — UserDetail dispatcher error reason picker must use ReferenceSelect
 * (real inline create), not a toast-only allowAddNew. Factory entityScoped create must insert
 * operating_company_id. Cursor even claim: 1784.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-dispatcher-error-inline-create";

const FILES = {
  userDetail: "apps/frontend/src/pages/UserDetail.tsx",
  registry: "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
  factory: "apps/backend/src/catalogs/generic-catalog.factory.ts",
  routes: "apps/backend/src/catalogs/generic-catalog.routes.ts",
};

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const user = read(FILES.userDetail);
  const registry = read(FILES.registry);
  const factory = read(FILES.factory);
  const routes = read(FILES.routes);

  if (!user) problems.push(`missing ${FILES.userDetail}`);
  else {
    if (!/createKind=["']dispatcher_error_reason["']/.test(user)) {
      problems.push(`${FILES.userDetail}: Error reason must use ReferenceSelect createKind=dispatcher_error_reason`);
    }
    if (/Add "\$\{query\}" from dispatcher error reasons catalog/.test(user) || /Add reason in catalog/.test(user)) {
      problems.push(`${FILES.userDetail}: must not toast fake "Add reason in catalog"`);
    }
  }

  if (!registry) problems.push(`missing ${FILES.registry}`);
  else {
    if (!/dispatcher_error_reason:\s*\{/.test(registry)) {
      problems.push(`${FILES.registry}: missing dispatcher_error_reason config`);
    }
    if (!/writeTable:\s*"catalogs\.dispatcher_error_reasons"/.test(registry)) {
      problems.push(`${FILES.registry}: writeTable must be catalogs.dispatcher_error_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/dispatch\/dispatcher-error-reasons/.test(registry)) {
      problems.push(`${FILES.registry}: must POST dispatch/dispatcher-error-reasons`);
    }
  }

  if (!factory) problems.push(`missing ${FILES.factory}`);
  else {
    if (!/entityScoped\?:/.test(factory) && !/entityScoped\?:/.test(factory)) {
      problems.push(`${FILES.factory}: must declare entityScoped on GenericCatalogConfig`);
    }
    if (!/insertColumns\.push\("operating_company_id"\)/.test(factory)) {
      problems.push(`${FILES.factory}: entityScoped CREATE must INSERT operating_company_id`);
    }
    if (!/withCompanyScope/.test(factory)) {
      problems.push(`${FILES.factory}: entityScoped paths must use withCompanyScope`);
    }
  }

  if (!routes) problems.push(`missing ${FILES.routes}`);
  else {
    if (!/dispatchErrorReasonsCatalogConfig[\s\S]{0,400}entityScoped:\s*true/.test(routes)) {
      problems.push(`${FILES.routes}: dispatchErrorReasonsCatalogConfig must set entityScoped: true`);
    }
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
  console.log(`${LABEL} OK — UserDetail dispatcher error inline create + entityScoped factory`);
}
