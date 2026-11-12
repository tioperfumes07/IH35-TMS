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
 *   R1  both state CASEs consume the SAME canonical PM state, with absent clocks 'none';
 *   R2  the canonical engine refuses absent baselines/current readings; its adapter cannot label them OK;
 *   R3  the page names what is missing ("No last PM on file — enter it", linked to the clock) and says
 *       "Odometer unavailable" only when the odometer is.
 *   R4  (LEAD 11-02) every mdata.units read (all 3: KPI, unit_state, rows) applies the shared fleet-visibility rule
 *       (excludeDemoPhantomSql + excludeSampleDataSql) — live /maintenance listed SAM-b7317a51 / SAM-c4530bd3 / SAM-fa16e203.
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
  adapter: "apps/backend/src/maintenance/fleet-health-pm.ts",
  engine: "apps/backend/src/maintenance/pm-due-engine.service.ts",
  line: "apps/frontend/src/pages/maintenance/components/FleetHealthLine.tsx",
};

export function audit(s) {
  const f = [];
  const cases = s.route.match(/ELSE COALESCE\(pm\.state, 'none'\)/g) ?? [];
  if (cases.length !== 2 || (s.route.match(/\$\{FLEET_PM_CTE\}/g) ?? []).length !== 2
      || !s.route.includes("fleetHealthPmRows(await computePmDueEngineForCompany(client, q.operating_company_id, odometers)")) {
    f.push("R1: KPI and rows must consume one canonical PM population, absent clocks never OK");
  }
  if (!s.engine.includes("const baselineAbsent = pmScheduleBaselineAbsentReason(row)")
      || !s.engine.includes("if (!isMiles || baselineAbsent)")
      || !s.engine.includes("else if (odo == null)")
      || !s.adapter.includes('row.miles_to_due == null ? (baselineAbsent ? "none" : "unknown")')
      || !s.adapter.includes('daysLeft == null ? "unknown"')) {
    f.push("R2: canonical baseline, current-odometer or projection absence is not preserved");
  }
  // ROUND 8.17 class R — PM leaf links carry return context; cohort filter `fh` lives in the URL.
  if (!/withReturnContext|pmHref\(/.test(s.line) || !/searchParams\.get\("fh"\)/.test(s.line)) {
    f.push(`${LABEL}: FleetHealthLine must put cohort in URL (fh) and wrap PM links with return context`);
  }
  if (!/data-testid="fleet-health-no-last-pm">\{t\("maintenance\.fleetHealth\.noLastPm"\)\}</.test(s.line) || !/t\("maintenance\.fleetHealth\.odometerUnavailable"\)/.test(s.line)) {
    f.push("R3: the page does not say what is missing (no last PM vs odometer unavailable)");
  }
  const unitReads = (s.route.match(/AND u\.disposed_date IS NULL/g) ?? []).length;
  const guarded = (s.route.match(/AND u\.disposed_date IS NULL\s*AND \$\{FLEET_HEALTH_VISIBLE_UNIT_SQL\}/g) ?? []).length;
  if (unitReads === 0 || guarded !== unitReads) f.push(`R4: ${unitReads - guarded} of ${unitReads} mdata.units read(s) skip the fleet-visibility rule (SAM-/TEST/DEMO phantoms + sample rows show)`);
  if (!/const FLEET_HEALTH_VISIBLE_UNIT_SQL = `\$\{excludeDemoPhantomSql\("u\.unit_number"\)\} AND \$\{excludeSampleDataSql\("u\.is_sample_data"\)\}`/.test(s.route)) {
    f.push("R4: FLEET_HEALTH_VISIBLE_UNIT_SQL is not the shared fleet-visibility rule");
  }
  return f;
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => (src[key].includes(from) ? audit({ ...src, [key]: src[key].replace(from, to) }).length > 0 : null);
  const cases = [
    ["clean sources pass", audit(src).length === 0],
    ["KPI CASE falling through to ok FAILS", plant("route", "ELSE COALESCE(pm.state, 'none')", "ELSE 'ok'")],
    ["baseline rule bypass FAILS", plant("engine", "if (!isMiles || baselineAbsent)", "if (!isMiles)")],
    ["missing current odometer refusal FAILS", plant("engine", "else if (odo == null)", "else if (false)")],
    ["missing remaining mileage labelled OK FAILS", plant("adapter", 'row.miles_to_due == null ? (baselineAbsent ? "none" : "unknown")', 'row.miles_to_due == null ? "ok"')],
    ["missing rate labelled OK FAILS", plant("adapter", 'daysLeft == null ? "unknown"', 'daysLeft == null ? "ok"')],
    ["missing shared KPI population FAILS", plant("route", "${FLEET_PM_CTE}", "pm_best AS (SELECT 1)")],
    ["a units read without the fleet-visibility rule FAILS", plant("route", "AND u.disposed_date IS NULL\n              AND ${FLEET_HEALTH_VISIBLE_UNIT_SQL}", "AND u.disposed_date IS NULL")],
    ["a local phantom rule instead of the shared one FAILS", plant("route", '${excludeDemoPhantomSql("u.unit_number")} AND ', "u.unit_number NOT ILIKE 'SAM-%' AND ")],
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
console.log(`${LABEL}: OK — a PM clock with no last PM is 'none' (never 'ok'), the page names the missing fact, and every units read hides SAM-/TEST/DEMO phantoms`);
