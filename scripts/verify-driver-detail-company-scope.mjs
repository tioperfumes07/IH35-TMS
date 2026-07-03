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

// Backend source-level guard: the non-aggregate by-id GET must scope by home company OR an active
// driver_company_authorizations fallback (mirrors buildDriverAggregate). Without the fallback a
// driver the caller is authorized to see 404s even when the frontend does not pass the param.
const backendFile = "apps/backend/src/mdata/drivers.routes.ts";
const backendSrc = (() => {
  try { return fs.readFileSync(path.join(ROOT, backendFile), "utf8"); } catch { return ""; }
})();
if (!backendSrc) errs.push(`${backendFile} not found`);
else {
  const getIdx = backendSrc.indexOf('app.get("/api/v1/mdata/drivers/:id"');
  const nextRouteIdx = backendSrc.indexOf('app.post("/api/v1/mdata/drivers/:id/resend-invite"');
  const handler = getIdx >= 0 && nextRouteIdx > getIdx ? backendSrc.slice(getIdx, nextRouteIdx) : "";
  if (!handler) errs.push(`could not locate GET /api/v1/mdata/drivers/:id handler in ${backendFile}`);
  else if (!/driver_company_authorizations/.test(handler))
    errs.push("GET /api/v1/mdata/drivers/:id non-aggregate scope dropped the driver_company_authorizations fallback — an authorized driver will false-404 (regression of the backend #1899 fix)");
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — DriverDetailPage scopes getDriver to the selected company.`);
