#!/usr/bin/env node
/**
 * ROUND 304 T-47 — GUARD. "NULL with a stated reason across any odometer gap. Never interpolate."
 * FAILS IF driven-miles-legs.service.ts:
 *   1. accepts a leg endpoint whose odometer_source is anything but real_obd;
 *   2. stops returning a stated null_reason for interpolated / absent endpoints;
 *   3. resolves driver-at-time without the shared driverAtTimeSql helper.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/telematics/driven-miles-legs.service.ts");

export function check(src) {
  const p = [];
  if (!/if \(source === "real_obd" && odometer != null/.test(src)) p.push("leg endpoints are no longer restricted to real_obd readings.");
  for (const r of ["exit_odometer_interpolated", "entry_odometer_interpolated", "exit_odometer_absent", "entry_odometer_absent", "odometer_went_backwards"]) {
    if (!src.includes(`"${r}"`)) p.push(`null reason "${r}" is gone -- a NULL leg must state why.`);
  }
  if (!/driverAtTimeSql\(/.test(src)) p.push("driver-at-time no longer resolves through driverAtTimeSql.");
  return p;
}

function selftest() {
  const good = `if (source === "real_obd" && odometer != null) return null; "exit_odometer_interpolated" "entry_odometer_interpolated" "exit_odometer_absent" "entry_odometer_absent" "odometer_went_backwards" driverAtTimeSql(a, b)`;
  const cases = [[good, false], [good.replace('source === "real_obd" && ', ""), true], [good.replace('"odometer_went_backwards"', ""), true], [good.replace("driverAtTimeSql(", "x("), true]];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-driven-miles-legs-never-interpolate selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-driven-miles-legs-never-interpolate FAILED:\n  - ${p.join("\n  - ")}` : "verify-driven-miles-legs-never-interpolate: OK -- real_obd endpoints only, every NULL states its reason, shared driver attribution.");
  process.exit(p.length ? 1 : 0);
}
