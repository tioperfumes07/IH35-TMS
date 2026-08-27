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
  if (!/assigned_primary_driver_name: driverLabel/.test(loads)) {
    failures.push(`${LOADS}: list payload no longer overlays assigned_primary_driver_name from resolver`);
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
  if (check(src).length !== 0) {
    console.error("FAIL(selftest): current sources must PASS");
    process.exit(1);
  }
  console.log("PASS(selftest): verify-dispatch-driver-historical-label-resolver");
}

if (process.argv.includes("--selftest")) selftest();
else run();
