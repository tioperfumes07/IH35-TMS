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

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function run(read = readSource) {
  const errors = [];
  const src = read(API);
  const routeSrc = read(ROUTE);
  const dispatchRouteSrc = read(DISPATCH_ROUTE);
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
  if (!/export function updateLoadStatus\([\s\S]{0,320}operatingCompanyId: string\s*\)/.test(src)) {
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
  const broken = readSource(API)
      .replace(
        /(export function updateLoadStatus\([\s\S]{0,320})operatingCompanyId: string/,
        "$1operatingCompanyId?: string | null",
      )
      .replace("/status?${query.toString()}", "/status")
      .replace("operating_company_id is required to update a load status", "status company optional")
      .replaceAll('["loads", "detail", operatingCompanyId, vars.id]', '["loads", "detail", vars.id]')
      .replaceAll('["loads", "audit", operatingCompanyId, vars.id]', '["loads", "audit", vars.id]')
      .replace('["dispatch", "load-detail", vars.id, operatingCompanyId]', '["dispatch", "load-detail", vars.id]');
  const brokenRoute = readSource(ROUTE)
      .replaceAll('const parsedQuery = loadDetailQuerySchema.safeParse(req.query ?? {});', 'const parsedQuery = { success: true, data: {} };')
      .replaceAll('await assertCompanyMembership(authUser.uuid, scopedCompanyId);', '')
      .replaceAll("operating_company_id = $2::uuid", "operating_company_id IN (SELECT org.user_accessible_company_ids())")
      .replaceAll("operating_company_id = $3::uuid", "operating_company_id IN (SELECT org.user_accessible_company_ids())");
  const brokenDispatchRoute = readSource(DISPATCH_ROUTE)
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
  const planted = run((rel) => {
    if (rel === API) return broken;
    if (rel === ROUTE) return brokenRoute;
    if (rel === DISPATCH_ROUTE) return brokenDispatchRoute;
    return readSource(rel);
  });
  const expectedFailures = [
    "must require operating_company_id",
    "legacy mdata status request must serialize",
    "must fail closed before any unscoped write",
    "status success must invalidate exact scoped cache",
    "status PATCH must require the company query schema",
    "status PATCH must validate requested company membership",
    "status SELECT and UPDATE must both bind exact requested company",
    "dispatch transition UPDATE must bind company",
    "driver-status timeline must never fabricate",
    "driver-status timeline must read exact-company immutable",
    "driver-status timeline must exclude spine events",
    "driver-status timeline must be deterministically chronological",
  ];
  const missed = expectedFailures.filter((needle) => !planted.some((error) => error.includes(needle)));
  if (missed.length) {
    throw new Error(`planted status scope vertical missed: ${missed.join("; ")}`);
  }
  console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
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
