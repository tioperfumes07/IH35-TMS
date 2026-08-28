#!/usr/bin/env node
/**
 * USMCA-WIRE-GATES — FE load status writes for post-dispatch transitions must use
 * /dispatch/loads/:id/transition with operating_company_id, never silent mdata fallback.
 *
 * Run: node scripts/verify-usmca-load-status-dispatch-transition.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "apps/frontend/src/api/loads.ts";
const ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const LABEL = "verify-usmca-load-status-dispatch-transition";

export function run() {
  const errors = [];
  const src = fs.readFileSync(path.join(ROOT, API), "utf8");
  const routeSrc = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const routeStart = routeSrc.indexOf('app.patch("/api/v1/mdata/loads/:id/status"');
  const routeEnd = routeSrc.indexOf('app.patch("/api/v1/mdata/loads/:id"', routeStart);
  const statusRoute = routeStart < 0 ? "" : routeSrc.slice(routeStart, routeEnd);

  if (!src.includes("transitionDispatchLoad")) {
    errors.push(`${API} must call transitionDispatchLoad for dispatch-mapped statuses`);
  }
  if (!/updateLoadStatus\([\s\S]*operatingCompanyId: string\n\)/.test(src)) {
    errors.push(`${API}: updateLoadStatus must require operating_company_id for every status path`);
  }
  if (/operatingCompanyId \? toDispatchTransitionStatus/.test(src)) {
    errors.push(`${API}: must not gate toDispatchTransitionStatus on operatingCompanyId — map first, then require opco`);
  }
  if (!/cancelLoad\([\s\S]*operatingCompanyId/.test(src)) {
    errors.push(`${API}: cancelLoad must accept operating_company_id and pass it to updateLoadStatus`);
  }
  if (!/\/mdata\/loads\/\$\{id\}\/status\?\$\{query\.toString\(\)\}/.test(src)) {
    errors.push(`${API}: legacy mdata status request must serialize operating_company_id`);
  }
  if (!/operating_company_id is required to update a load status/.test(src)) {
    errors.push(`${API}: status mutation hook must fail closed before any unscoped write`);
  }
  for (const key of [
    '["loads", "detail", operatingCompanyId, vars.id]',
    '["loads", "audit", operatingCompanyId, vars.id]',
    '["dispatch", "load-detail", vars.id, operatingCompanyId]',
  ]) {
    if (!src.includes(key)) errors.push(`${API}: status success must invalidate exact scoped cache ${key}`);
  }
  if (!/loadDetailQuerySchema\.safeParse\(req\.query \?\? \{\}\)/.test(statusRoute)) {
    errors.push(`${ROUTE}: status PATCH must require the company query schema`);
  }
  if (!/await assertCompanyMembership\(authUser\.uuid, scopedCompanyId\)/.test(statusRoute)) {
    errors.push(`${ROUTE}: status PATCH must validate requested company membership`);
  }
  if (!/operating_company_id = \$2::uuid/.test(statusRoute) || !/operating_company_id = \$3::uuid/.test(statusRoute)) {
    errors.push(`${ROUTE}: status SELECT and UPDATE must both bind exact requested company`);
  }

  return errors;
}

function selftest() {
  const apiPath = path.join(ROOT, API);
  const routePath = path.join(ROOT, ROUTE);
  const backup = fs.readFileSync(apiPath, "utf8");
  const routeBackup = fs.readFileSync(routePath, "utf8");
  try {
    const broken = backup
      .replace("operatingCompanyId: string\n)", "operatingCompanyId?: string | null\n)")
      .replace("/status?${query.toString()}", "/status")
      .replace("operating_company_id is required to update a load status", "status company optional")
      .replaceAll('["loads", "detail", operatingCompanyId, vars.id]', '["loads", "detail", vars.id]')
      .replaceAll('["loads", "audit", operatingCompanyId, vars.id]', '["loads", "audit", vars.id]')
      .replace('["dispatch", "load-detail", vars.id, operatingCompanyId]', '["dispatch", "load-detail", vars.id]');
    const brokenRoute = routeBackup
      .replaceAll('const parsedQuery = loadDetailQuerySchema.safeParse(req.query ?? {});', 'const parsedQuery = { success: true, data: {} };')
      .replaceAll('await assertCompanyMembership(authUser.uuid, scopedCompanyId);', '')
      .replaceAll("operating_company_id = $2::uuid", "operating_company_id IN (SELECT org.user_accessible_company_ids())")
      .replaceAll("operating_company_id = $3::uuid", "operating_company_id IN (SELECT org.user_accessible_company_ids())");
    fs.writeFileSync(apiPath, broken, "utf8");
    fs.writeFileSync(routePath, brokenRoute, "utf8");
    const planted = run();
    if (planted.length < 9) {
      throw new Error(`planted status scope vertical produced only ${planted.length} failures`);
    }
    console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(apiPath, backup, "utf8");
    fs.writeFileSync(routePath, routeBackup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
}

main();
