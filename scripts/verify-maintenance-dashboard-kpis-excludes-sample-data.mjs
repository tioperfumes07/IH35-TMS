#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["maintenance.dashboard.kpis"]} */
/**
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): GET /api/v1/maintenance/dashboard/kpis (a
 * fourth, independent mdata.units reader distinct from fleet-table/kpis, #15082, and
 * maintenance/kpi/summary, #15089) computed total_units/active_units/dot_oos with zero demo/phantom
 * or is_sample_data exclusion. Live-measured on prod 2026-08-24 (Neon tiny-field-89581227, USMCA):
 * unfiltered total_units=44, active_units(InService)=31 -- the same fixture-inflation class already
 * fixed on the sibling maintenance dashboards.
 *
 * Self-test: node scripts/verify-maintenance-dashboard-kpis-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/maintenance/dashboard-kpis.routes.ts",
  visibility: "apps/backend/src/mdata/fleet-visibility.ts",
};
const LABEL = "verify-maintenance-dashboard-kpis-excludes-sample-data";

export function audit(src) {
  const failures = [];
  const match = src.routes.match(/FROM mdata\.units[\s\S]*?`,/);
  if (!match) {
    failures.push(`${FILES.routes}: the dashboard/kpis fleet subquery not found (re-anchor)`);
    return failures;
  }
  // ROUND 326 queue item 17 / audit M3: the subquery now reads THE ONE fleet roster, fleetRosterSql, whose base
  // predicate carries both exclusions. Either form passes — direct calls in the subquery, or fleetRosterSql with both
  // exclusions inside fleetRosterBaseSql (checked there, so dropping one from the shared roster still fails).
  if (/\$\{fleetRosterSql\(/.test(match[0])) {
    const base = (src.visibility ?? "").match(/function fleetRosterBaseSql\([\s\S]*?\n\}/);
    if (!base) {
      failures.push(`${FILES.visibility}: fleetRosterBaseSql not found (re-anchor)`);
      return failures;
    }
    if (!/excludeDemoPhantomSql\(c\("unit_number"\)\)/.test(base[0])) {
      failures.push(`${FILES.visibility}: the fleet roster must apply excludeDemoPhantomSql on unit_number — a demo/phantom fixture unit would inflate the maintenance dashboard KPI tiles.`);
    }
    if (!/excludeSampleDataSql\(c\("is_sample_data"\)\)/.test(base[0])) {
      failures.push(`${FILES.visibility}: the fleet roster must apply excludeSampleDataSql — a sample-tagged fixture unit would inflate the maintenance dashboard KPI tiles (FLEET-VISIBILITY-F4583).`);
    }
    return failures;
  }
  if (!/excludeDemoPhantomSql\(\s*["']unit_number["']\s*\)/.test(match[0])) {
    failures.push(
      `${FILES.routes}: the fleet subquery must apply excludeDemoPhantomSql("unit_number") — a ` +
        `demo/phantom fixture unit would inflate the maintenance dashboard KPI tiles.`,
    );
  }
  if (!/excludeSampleDataSql\(\)/.test(match[0])) {
    failures.push(
      `${FILES.routes}: the fleet subquery must apply excludeSampleDataSql() — a sample-tagged ` +
        `fixture unit would inflate the maintenance dashboard KPI tiles (FLEET-VISIBILITY-F4583).`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
    visibility: fs.readFileSync(path.join(root, FILES.visibility), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { file: "routes", from: '${fleetRosterSql("", "$1")}', to: "operating_company_id = $1::uuid" },
    { file: "visibility", from: '    excludeDemoPhantomSql(c("unit_number")),\n', to: "" },
    { file: "visibility", from: '    excludeSampleDataSql(c("is_sample_data")),\n', to: "" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutated = good[m.file].split(m.from).join(m.to);
    if (mutated === good[m.file]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from)}`);
      process.exit(1);
    }
    if (audit({ ...good, [m.file]: mutated }).length === 0) {
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
console.log(`${LABEL} PASS — maintenance dashboard/kpis excludes demo/phantom + is_sample_data fixture units`);
