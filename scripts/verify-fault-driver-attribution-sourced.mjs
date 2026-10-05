#!/usr/bin/env node
/**
 * ROUND 321 (d): a fault or harsh event attributed to a driver always says HOW (attribution_source
 * 'samsara_driver' | 'load_assignment'), and the attribution goes through the ONE composed resolver
 * driverAtTimeWithLoadFallbackSql (driverAtTimeSql, else the load-at-time driver). "No driver without a source" is
 * structural: driver_id and attribution_source are produced from the SAME two branches in the helper, so this guard
 * pins that shape and every reader's use of it. driverAtTimeSql itself must stay the plain Samsara-window resolver
 * (fuel / settlement attribution depend on it unchanged).
 */
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--selftest")) selftest();

const helper = readFileSync("apps/backend/src/maintenance/driver-attribution.ts", "utf8");
const fails = [];
const fn = (helper.match(/export function driverAtTimeWithLoadFallbackSql[\s\S]*?\n}\n/) ?? [""])[0];
if (!fn) fails.push("driverAtTimeWithLoadFallbackSql missing");
if (!/\$\{driverAtTimeSql\(unitAlias, tsExpr, sam\)\}/.test(fn) || !/\$\{loadAtTimeSql\(unitAlias, tsExpr, ld\)\}/.test(fn)) fails.push("composed resolver must be built from driverAtTimeSql + loadAtTimeSql (no inlined rule)");
if (!/COALESCE\(\$\{sam\}\.driver_id, ll\.assigned_primary_driver_id\) AS driver_id/.test(fn)
    || !/WHEN \$\{sam\}\.driver_id IS NOT NULL THEN 'samsara_driver'/.test(fn)
    || !/WHEN ll\.assigned_primary_driver_id IS NOT NULL THEN 'load_assignment' END AS attribution_source/.test(fn)) fails.push("driver_id and attribution_source must come from the same two branches (no driver without a source)");
const plain = (helper.match(/export function driverAtTimeSql[\s\S]*?\n}\n/) ?? [""])[0];
if (/load|COALESCE/i.test(plain)) fails.push("driverAtTimeSql must stay the plain Samsara-window resolver (money attribution depends on it)");
for (const f of ["apps/backend/src/maintenance/fault-code-alerts.routes.ts", "apps/backend/src/driver-profile/driver-profile-tabs.service.ts", "apps/backend/src/telematics/telematics-linkage.service.ts"]) {
  const s = readFileSync(f, "utf8");
  if (!/driverAtTimeWithLoadFallbackSql\("h\.unit_id", "h\.occurred_at"\)/.test(s) || !/attribution_source/.test(s)) fails.push(`${f}: faults must use the composed resolver and return attribution_source`);
}
if (fails.length) { console.error("verify-fault-driver-attribution-sourced: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-fault-driver-attribution-sourced: OK (resolver shape + 3 readers)");

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-fault-driver-attribution-sourced", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
