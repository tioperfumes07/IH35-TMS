#!/usr/bin/env node
/**
 * ORDERS 2026-10-01 row 4 — GUARD for the driver-profile tab backend.
 * FAILS IF driver-profile-tabs.service.ts:
 *   1. writes anything (INSERT / UPDATE / DELETE) — the tabs are read-only;
 *   2. attributes unit-only facts (fuel fills, engine faults) by anything but driverAtTimeSql;
 *   3. reads a unit's CURRENT driver (mdata.units assigned/current driver) to attribute history;
 *   4. recomputes fuel verdicts instead of composing CC-2's fuel.fraud_alerts + safety.fuel_gps_matches.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/driver-profile/driver-profile-tabs.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (/\b(INSERT INTO|UPDATE\s+[a-z_]+\.|DELETE FROM)\b/i.test(src)) p.push("a driver-profile tab writes data.");
  if (!/driverAtTimeSql\("f\.unit_id", "f\.transaction_at"\)/.test(src)) p.push("fuel fills are not attributed with driverAtTimeSql at the fill time.");
  if (!/driverAtTimeSql\("h\.unit_id", "h\.occurred_at"\)/.test(src)) p.push("engine faults are not attributed with driverAtTimeSql at the fault time.");
  if (/assigned_driver_id|current_driver_id/.test(src)) p.push("a tab reads a unit's current driver to attribute history.");
  if (!/FROM fuel\.fraud_alerts/.test(src) || !/FROM safety\.fuel_gps_matches/.test(src)) p.push("fuel verdicts are no longer composed from CC-2's tables.");
  return p;
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  const cases = [
    [g, false],
    [g + "\nconst x = `DELETE FROM mdata.drivers`;", true],
    [g.replace('driverAtTimeSql("f.unit_id", "f.transaction_at")', '""'), true],
    [g + "\nconst y = `u.assigned_driver_id`;", true],
    [g.replace("FROM fuel.fraud_alerts", "FROM x"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-driver-profile-tabs-read-only-and-attributed selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-driver-profile-tabs-read-only-and-attributed FAILED:\n  - ${p.join("\n  - ")}` : "verify-driver-profile-tabs-read-only-and-attributed: OK -- read-only, driver-at-time attribution, CC-2 verdicts composed.");
  process.exit(p.length ? 1 : 0);
}
