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
const DISPATCH_ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const LABEL = "verify-usmca-load-status-dispatch-transition";

export function run() {
  const errors = [];
  const src = fs.readFileSync(path.join(ROOT, API), "utf8");
  const routeSrc = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const dispatchRouteSrc = fs.readFileSync(path.join(ROOT, DISPATCH_ROUTE), "utf8");
  const routeStart = routeSrc.indexOf('app.patch("/api/v1/mdata/loads/:id/status"');
  const routeEnd = routeSrc.indexOf('app.patch("/api/v1/mdata/loads/:id"', routeStart);
  const statusRoute = routeStart < 0 ? "" : routeSrc.slice(routeStart, routeEnd);
  const dispatchTransitionStart = dispatchRouteSrc.indexOf('app.patch("/api/v1/dispatch/loads/:id/transition"');
  const dispatchTransitionEnd = dispatchRouteSrc.indexOf(
    'app.get("/api/v1/dispatch/loads/:id/driver-status"',
    dispatchTransitionStart
  );
  const dispatchTransitionRoute =
    dispatchTransitionStart < 0 ? "" : dispatchRouteSrc.slice(dispatchTransitionStart, dispatchTransitionEnd);
  const driverStatusRoute =
    dispatchTransitionEnd < 0 ? "" : dispatchRouteSrc.slice(dispatchTransitionEnd);

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
  if (
    !/const transitionUpdate = await client\.query<\{ id: string \}>\([\s\S]{0,240}UPDATE mdata\.loads\s+SET status = \$2\s+WHERE id = \$1\s+AND operating_company_id = \$3::uuid\s+RETURNING id[\s\S]{0,180}if \(!transitionUpdate\.rows\[0\]\?\.id\) return \{ error: "not_found" as const \}/.test(
      dispatchTransitionRoute
    )
  ) {
    errors.push(`${DISPATCH_ROUTE}: dispatch transition UPDATE must bind company and prove the row changed before side effects`);
  }
  if (driverStatusRoute.includes('source: "phase3_stub"') || driverStatusRoute.includes("new Date().toISOString()")) {
    errors.push(`${DISPATCH_ROUTE}: driver-status timeline must never fabricate a request-time lifecycle event`);
  }
  if (!/FROM events\.event_log e[\s\S]*e\.operating_company_id = \$2::uuid[\s\S]*e\.subject_id = \$1::uuid[\s\S]*e\.event_type = 'load\.status_changed'/.test(driverStatusRoute)) {
    errors.push(`${DISPATCH_ROUTE}: driver-status timeline must read exact-company immutable load.status_changed events`);
  }
  if (!/NULLIF\(e\.payload->>'to_status', ''\) IS NOT NULL/.test(driverStatusRoute)) {
    errors.push(`${DISPATCH_ROUTE}: driver-status timeline must exclude spine events without a canonical destination stage`);
  }
  if (!/ORDER BY e\.occurred_at ASC, e\.event_id ASC/.test(driverStatusRoute)) {
    errors.push(`${DISPATCH_ROUTE}: driver-status timeline must be deterministically chronological`);
  }

  return errors;
}

function selftest() {
  const apiPath = path.join(ROOT, API);
  const routePath = path.join(ROOT, ROUTE);
  const dispatchRoutePath = path.join(ROOT, DISPATCH_ROUTE);
  const backup = fs.readFileSync(apiPath, "utf8");
  const routeBackup = fs.readFileSync(routePath, "utf8");
  const dispatchRouteBackup = fs.readFileSync(dispatchRoutePath, "utf8");
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
    const brokenDispatchRoute = dispatchRouteBackup
      .replace(
        "AND operating_company_id = $3::uuid\n         RETURNING id",
        "AND operating_company_id IN (SELECT org.user_accessible_company_ids())\n         RETURNING id"
      )
      .replace("if (!transitionUpdate.rows[0]?.id)", "if (false)")
      .replace("FROM events.event_log e", "FROM mdata.loads e")
      .replace("e.operating_company_id = $2::uuid", "e.operating_company_id IN (SELECT org.user_accessible_company_ids())")
      .replace("NULLIF(e.payload->>'to_status', '') IS NOT NULL", "true")
      .replace("ORDER BY e.occurred_at ASC, e.event_id ASC", "ORDER BY now()")
      .replace("timeline: result.timeline", 'timeline: [{ stage: result.load.driver_lifecycle_stage, at: new Date().toISOString(), source: "phase3_stub" }]');
    fs.writeFileSync(apiPath, broken, "utf8");
    fs.writeFileSync(routePath, brokenRoute, "utf8");
    fs.writeFileSync(dispatchRoutePath, brokenDispatchRoute, "utf8");
    const planted = run();
    if (planted.length < 14) {
      throw new Error(`planted status scope vertical produced only ${planted.length} failures`);
    }
    console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(apiPath, backup, "utf8");
    fs.writeFileSync(routePath, routeBackup, "utf8");
    fs.writeFileSync(dispatchRoutePath, dispatchRouteBackup, "utf8");
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
