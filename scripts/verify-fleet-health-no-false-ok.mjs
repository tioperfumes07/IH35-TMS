#!/usr/bin/env node
/**
 * LEAD 443.281 row 108 ("All 43 trucks 'PM reading unavailable'; 0 work orders; MTD cost $0.00").
 *
 * Measured on prod 10-23: 43 units; 27 have no PM clock; 16 have a miles clock with NO last-PM odometer and NO next-due
 * (64 schedules seeded 09-30, no service history). maintenance/fleet-health.routes.ts fell through its state CASE to 'ok'
 * for those 16 (NULL arithmetic) — the KPI counted 16 unknown PM states as OK — and the page said "PM reading
 * unavailable" although 35 trucks HAVE a live odometer. The missing fact is the last PM, which pm-auto-engine already
 * refuses to guess (pmScheduleBaselineAbsentReason).
 *
 *   R1  both state CASEs (KPI + per unit) send a baseline-absent clock to 'none' BEFORE the overdue/soon/ok arithmetic;
 *   R2  PM_BASELINE_ABSENT_SQL is the SQL twin of pmScheduleBaselineAbsentReason (no next-due AND last <= 1);
 *   R3  the page names what is missing ("No last PM on file — enter it", linked to the clock) and says
 *       "Odometer unavailable" only when the odometer is.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "static source scan; never connects to a database";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-health-no-false-ok";
const FILES = {
  route: "apps/backend/src/maintenance/fleet-health.routes.ts",
  line: "apps/frontend/src/pages/maintenance/components/FleetHealthLine.tsx",
};

export function audit(s) {
  const f = [];
  const cases = s.route.match(/WHEN pm\.unit_id IS NULL THEN 'none'\s*(?:--[^\n]*\n\s*)*WHEN \$\{PM_BASELINE_ABSENT_SQL\("pm"\)\} THEN 'none'/g) ?? [];
  if (cases.length < 2) f.push(`R1: ${2 - cases.length} state CASE(s) let a clock with no last-PM baseline fall through to 'ok'`);
  if (!/const PM_BASELINE_ABSENT_SQL = \(a: string\) =>\s*`\(\$\{a\}\.next_due_odometer IS NULL AND COALESCE\(\$\{a\}\.last_service_odometer, 0\) <= 1\)`/.test(s.route)) {
    f.push("R2: PM_BASELINE_ABSENT_SQL is not the twin of pmScheduleBaselineAbsentReason (no next-due AND last <= 1)");
  }
  if (!/data-testid="fleet-health-no-last-pm">\{t\("maintenance\.fleetHealth\.noLastPm"\)\}</.test(s.line) || !/t\("maintenance\.fleetHealth\.odometerUnavailable"\)/.test(s.line)) {
    f.push("R3: the page does not say what is missing (no last PM vs odometer unavailable)");
  }
  return f;
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => (src[key].includes(from) ? audit({ ...src, [key]: src[key].replace(from, to) }).length > 0 : null);
  const cases = [
    ["clean sources pass", audit(src).length === 0],
    ["KPI CASE falling through to ok FAILS", plant("route", 'WHEN ${PM_BASELINE_ABSENT_SQL("pm")} THEN \'none\'\n                WHEN COALESCE(tele', "WHEN COALESCE(tele")],
    ["baseline rule ignoring next-due FAILS", plant("route", "`(${a}.next_due_odometer IS NULL AND ", "`(")],
    ["generic 'PM reading unavailable' only FAILS", plant("line", 't("maintenance.fleetHealth.noLastPm")', 't("maintenance.fleetHealth.pmReadingUnavailable")')],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = audit(src);
if (failures.length) {
  console.error(`${LABEL}: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — a PM clock with no last PM is 'none' (never 'ok'), and the page names the missing fact`);
