#!/usr/bin/env node
/** @matrix-built {"modules":["home"],"cols":["connectivity"],"leaves":["home.widget.fleet_utilization"]} */
/**
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): GET /api/v1/home/fleet-utilization backs the
 * Office HOME "Fleet Snapshot" widget's active/total-units gauge. Its total-units query read
 * mdata.units with zero demo/phantom or is_sample_data exclusion -- live-measured on prod 2026-08-24
 * (Neon tiny-field-89581227, USMCA): unfiltered count 44 vs. correctly-excluded 38, a 6-unit / ~16%
 * inflated denominator, understating the displayed utilization percentage. The active-units query
 * (COUNT DISTINCT assigned_unit_id FROM mdata.loads) also lacked an is_sample_data exclusion on the
 * load side (0 live impact today, fixed defensively to match the same class already fixed on Fleet
 * roster/KPI, #15082/#15084/#15089/#15123).
 *
 * Self-test: node scripts/verify-home-fleet-utilization-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/home/home-widgets.routes.ts",
  onLoad: "apps/backend/src/dispatch/active-loads-count.ts",
};
// LEAD 443.206R moved the busy-truck test to the canonical open_dispatch membership + the ONE on-load status set
// (DISPATCH_ON_LOAD_STATUSES). This guard reads that set where it lives: it must never admit a not-yet-dispatched
// or a finished load (assigned_not_dispatched / delivered* / terminal), which would count a free truck as busy.
const NOT_ON_LOAD = ["assigned_not_dispatched", "delivered", "delivered_pending_docs", "cancelled", "void", "completed", "closed", "invoiced", "paid", "draft"];
const LABEL = "verify-home-fleet-utilization-excludes-sample-data";

export function audit(src) {
  const failures = [];

  const totalMatch = src.routes.match(/FROM mdata\.units u[\s\S]*?`,\s*\n\s*\[parsed\.data\.operating_company_id\]/);
  if (!totalMatch) {
    failures.push(`${FILES.routes}: the fleet-utilization total-units query not found (re-anchor)`);
  } else {
    if (!/excludeDemoPhantomSql\(\s*["']u\.unit_number["']\s*\)/.test(totalMatch[0])) {
      failures.push(
        `${FILES.routes}: fleet-utilization total-units query must apply ` +
          `excludeDemoPhantomSql("u.unit_number") — demo/phantom fixture units would inflate the ` +
          `Office HOME Fleet Snapshot denominator.`,
      );
    }
    if (!/excludeSampleDataSql\(\s*["']u\.is_sample_data["']\s*\)/.test(totalMatch[0])) {
      failures.push(
        `${FILES.routes}: fleet-utilization total-units query must apply ` +
          `excludeSampleDataSql("u.is_sample_data") — is_sample_data fixture units would inflate the ` +
          `Office HOME Fleet Snapshot denominator (FLEET-VISIBILITY-F4583).`,
      );
    }
  }

  const activeMatch = src.routes.match(/SELECT COUNT\(DISTINCT l\.assigned_unit_id\)[\s\S]*?FROM mdata\.loads[\s\S]*?`,\s*\n\s*\[[^\]]*\]\]?/);
  if (!activeMatch) {
    failures.push(`${FILES.routes}: the fleet-utilization active-units query not found (re-anchor)`);
  } else {
    if (!/is_sample_data IS NOT TRUE/.test(activeMatch[0])) {
      failures.push(
        `${FILES.routes}: fleet-utilization active-units query must exclude is_sample_data loads — a ` +
          `sample load assigned to a unit would inflate the active-units numerator.`,
      );
    }
    if (!/\$\{loadServiceMembershipSql\("l", "open_dispatch", "\$1::uuid"\)\}/.test(activeMatch[0])) {
      failures.push(`${FILES.routes}: active-units must use the canonical open_dispatch load-service membership (443.206R), not a private status list`);
    }
    if (!/l\.status::text = ANY\(\$2::text\[\]\)/.test(activeMatch[0]) || !/\[\.\.\.DISPATCH_ON_LOAD_STATUSES\]/.test(activeMatch[0])) {
      failures.push(`${FILES.routes}: active-units must bind the ONE on-load status set DISPATCH_ON_LOAD_STATUSES`);
    }
    if (/l\.status::text NOT IN \(/.test(activeMatch[0])) {
      failures.push(`${FILES.routes}: active-units carries an inline NOT IN status list — use the canonical set`);
    }
  }
  const set = (src.onLoad ?? "").match(/export const DISPATCH_ON_LOAD_STATUSES = \[([\s\S]*?)\] as const;/);
  if (!set) {
    failures.push(`${FILES.onLoad}: DISPATCH_ON_LOAD_STATUSES not found (re-anchor)`);
  } else {
    for (const st of NOT_ON_LOAD) {
      if (new RegExp(`["']${st}["']`).test(set[1])) failures.push(`${FILES.onLoad}: DISPATCH_ON_LOAD_STATUSES admits '${st}' — a free truck would count as busy`);
    }
  }

  const driverRoster = src.routes.match(/app\.get\("\/api\/v1\/home\/drivers-on-duty"[\s\S]*?return \{ active, total_drivers, on_break: 0 \};/i)?.[0] ?? "";
  for (const token of [
    "driver_company_authorizations home_duty_roster_dca",
    "home_duty_roster_dca.driver_id = d.id",
    "home_duty_roster_dca.company_id = $1::uuid",
    "home_duty_roster_dca.is_authorized = true",
    "home_duty_roster_dca.deactivated_at IS NULL",
  ]) {
    if (!driverRoster.includes(token)) failures.push(`${FILES.routes}: drivers-on-duty denominator missing ${token}`);
  }

  return failures;
}

function loadSrc(root) {
  return {
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
    onLoad: fs.readFileSync(path.join(root, FILES.onLoad), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { from: '\n              AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { from: '\n              AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
    { from: "\n              AND l.is_sample_data IS NOT TRUE", to: "" },
    { from: "home_duty_roster_dca.is_authorized = true", to: "home_duty_roster_dca.is_authorized = false" },
    { from: "home_duty_roster_dca.deactivated_at IS NULL", to: "home_duty_roster_dca.deactivated_at IS NOT NULL" },
    { from: '\n              AND ${loadServiceMembershipSql("l", "open_dispatch", "$1::uuid")}', to: "" },
    { from: "AND l.status::text = ANY($2::text[])", to: "AND l.status::text NOT IN ('delivered', 'cancelled')" },
  ];
  let detected = 0;
  // The original CC-3 regression shape: the on-load set admits a not-yet-dispatched load (a free truck counts busy).
  {
    const plantedSet = good.onLoad.replace("export const DISPATCH_ON_LOAD_STATUSES = [", 'export const DISPATCH_ON_LOAD_STATUSES = [\n  "assigned_not_dispatched",');
    if (plantedSet === good.onLoad) { console.error(`${LABEL} SELFTEST FAIL — on-load set plant did not change source`); process.exit(1); }
    if (audit({ ...good, onLoad: plantedSet }).length === 0) { console.error(`${LABEL} SELFTEST FAIL — on-load set admitting assigned_not_dispatched escaped`); process.exit(1); }
    detected += 1;
  }
  for (const m of mutations) {
    const mutatedRoutes = good.routes.split(m.from).join(m.to);
    if (mutatedRoutes === good.routes) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from)}`);
      process.exit(1);
    }
    if (audit({ ...good, routes: mutatedRoutes }).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m.from)}`);
      process.exit(1);
    }
    detected += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${detected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Office HOME fleet-utilization widget excludes demo/phantom + is_sample_data fixtures`);
