#!/usr/bin/env node
// verify-driver-detail-company-scope.mjs
// Regression guard for the DriverDetailPage "Driver not found" 404 (follow-up to #1882).
// The /drivers/:id detail page must fetch the driver scoped to the SELECTED company
// (operating_company_id from CompanyContext), NOT the bare getDriver(id) which resolves
// only the user's default company and 404s under any other selected company.
//
// Fails if DriverDetail.tsx reverts to calling getDriver(id) without the company scope,
// or stops sourcing selectedCompanyId from CompanyContext.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-detail-company-scope";
const file = "apps/frontend/src/pages/DriverDetail.tsx";
const src = (() => {
  try { return fs.readFileSync(path.join(ROOT, file), "utf8"); } catch { return ""; }
})();

const errs = [];
if (!src) errs.push(`${file} not found`);
else {
  if (!/useCompanyContext\s*\(/.test(src))
    errs.push("DriverDetailPage must read the selected company via useCompanyContext()");
  // getDriver must be called WITH a second (company) argument — not the bare getDriver(id).
  const bareCall = /getDriver\(\s*id\s*\)/.test(src);
  const scopedCall = /getDriver\(\s*id\s*,\s*[A-Za-z0-9_]+/.test(src);
  if (bareCall && !scopedCall)
    errs.push("getDriver(id) is called WITHOUT the company scope — pass the selected operating_company_id (regression of the #1882 follow-up 404 fix)");
  if (!scopedCall)
    errs.push("expected getDriver(id, <companyId>) scoped call in DriverDetailPage");
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — DriverDetailPage scopes getDriver to the selected company.`);
