#!/usr/bin/env node
/**
 * DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS
 *
 * mdata.drivers SELECT RLS hides deactivated_at IS NOT NULL (correct for pickers). Dispatch list,
 * load detail, and trip-pairing JOIN then rendered "Driver — not visible". Canonical fix:
 * mdata.resolve_driver_label_same_company (SECURITY DEFINER, same-company, label-only) + COALESCE
 * on historical readers. Does NOT weaken drivers_select.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202613201200_dispatch_driver_historical_label_resolver.sql";
const LOADS = "apps/backend/src/dispatch/loads.routes.ts";
const TRIP = "apps/backend/src/dispatch/trip-pairing-board.service.ts";

export function check({ mig, loads, trip }) {
  const failures = [];
  if (!/CREATE OR REPLACE FUNCTION mdata\.resolve_driver_label_same_company/.test(mig)) {
    failures.push(`${MIG}: missing CREATE OR REPLACE FUNCTION mdata.resolve_driver_label_same_company`);
  }
  if (!/SECURITY DEFINER/.test(mig)) {
    failures.push(`${MIG}: resolver is no longer SECURITY DEFINER`);
  }
  if (!/GRANT EXECUTE ON FUNCTION mdata\.resolve_driver_label_same_company/.test(mig)) {
    failures.push(`${MIG}: missing GRANT EXECUTE to ih35_app`);
  }
  if (!/REVOKE ALL ON FUNCTION mdata\.resolve_driver_label_same_company/.test(mig)) {
    failures.push(`${MIG}: missing REVOKE ALL FROM PUBLIC`);
  }
  if (!/mdata\.resolve_driver_label_same_company\(l\.assigned_primary_driver_id/.test(loads)) {
    failures.push(`${LOADS}: list/detail no longer calls resolve_driver_label_same_company for primary driver`);
  }
  if (!/mdata\.resolve_driver_label_same_company\(l\.assigned_secondary_driver_id/.test(loads)) {
    failures.push(`${LOADS}: detail no longer resolves secondary driver historical label`);
  }
  // RE-PIN 443.206R item 4 (register C1): the list's assigned_primary_driver_name is the FULL name from the load service,
  // falling back to the historical resolver (a deactivated driver hidden by drivers_select RLS) — never the short label.
  if (!/assigned_primary_driver_name: row\.driver_full_name \|\| resolved \|\| null/.test(loads) ||
      !/const resolved = row\.assigned_primary_driver_name_resolved/.test(loads)) {
    failures.push(`${LOADS}: list payload no longer falls back to the resolver for assigned_primary_driver_name`);
  }
  if (!/mdata\.resolve_driver_label_same_company\(l\.assigned_primary_driver_id/.test(trip)) {
    failures.push(`${TRIP}: trip-pairing load_driver_name no longer COALESCE-resolves deactivated drivers`);
  }
  return failures;
}

function readAll() {
  return {
    mig: fs.readFileSync(path.join(ROOT, MIG), "utf8"),
    loads: fs.readFileSync(path.join(ROOT, LOADS), "utf8"),
    trip: fs.readFileSync(path.join(ROOT, TRIP), "utf8"),
  };
}

function run() {
  const failures = check(readAll());
  if (failures.length) {
    console.error("FAIL: verify-dispatch-driver-historical-label-resolver");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: verify-dispatch-driver-historical-label-resolver");
}

function selftest() {
  const src = readAll();
  const offender = { ...src, loads: src.loads.replaceAll("mdata.resolve_driver_label_same_company", "GONE") };
  if (check(offender).length === 0) {
    console.error("FAIL(selftest): planted missing resolver was NOT caught");
    process.exit(1);
  }
  const noFallback = { ...src, loads: src.loads.replace("assigned_primary_driver_name: row.driver_full_name || resolved || null", "assigned_primary_driver_name: row.driver_full_name || null") };
  if (noFallback.loads === src.loads || check(noFallback).length === 0) {
    console.error("FAIL(selftest): planted dropped resolver fallback was NOT caught");
    process.exit(1);
  }
  if (check(src).length !== 0) {
    console.error("FAIL(selftest): current sources must PASS");
    process.exit(1);
  }
  console.log("PASS(selftest): verify-dispatch-driver-historical-label-resolver");
}

if (process.argv.includes("--selftest")) selftest();
else run();
