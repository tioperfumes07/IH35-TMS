#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leaves":["reports.profit_per_truck","reports.per_truck_cpm"]} */
/**
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): the profit-per-truck family of reports
 * (GET-backed profit-per-truck.routes.ts main list + a second aggregate section, the weekly
 * profitPerTruckWeeklyQuery, and the per-truck cost-per-mile calculator) all read mdata.units with
 * zero demo/phantom or is_sample_data exclusion. Live-confirmed on prod 2026-08-24 (Neon
 * tiny-field-89581227, USMCA, bypass_rls('lucia')): 6 real loads with real dollar amounts
 * ($2,450 / $1,000 / etc.) are attached to units named "TEST-UNIT-20260806-01" and "TEST-U01" --
 * fixture units whose fixture loads would surface as real per-truck revenue/profit/cost-per-mile on
 * these reports without this exclusion.
 *
 * Self-test: node scripts/verify-profit-per-truck-cpm-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/reports/profit-per-truck.routes.ts",
  weekly: "apps/backend/src/reports/queries/profit-per-truck-weekly.ts",
  cpm: "apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts",
};
const LABEL = "verify-profit-per-truck-cpm-excludes-sample-data";

function countCalls(text, re) {
  return (text.match(new RegExp(re.source, "g")) ?? []).length;
}

export function audit(src) {
  const failures = [];

  const demoRe = /excludeDemoPhantomSql\(\s*["']u\.unit_number["']\s*\)/;
  const sampleRe = /excludeSampleDataSql\(\s*["']u\.is_sample_data["']\s*\)/;

  const routesDemo = countCalls(src.routes, demoRe);
  const routesSample = countCalls(src.routes, sampleRe);
  if (routesDemo < 2) {
    failures.push(
      `${FILES.routes}: expected excludeDemoPhantomSql("u.unit_number") on BOTH mdata.units queries ` +
        `(found ${routesDemo}) — demo/phantom fixture units would surface real per-truck profit.`,
    );
  }
  if (routesSample < 2) {
    failures.push(
      `${FILES.routes}: expected excludeSampleDataSql("u.is_sample_data") on BOTH mdata.units queries ` +
        `(found ${routesSample}) — sample-tagged fixture units would surface real per-truck profit ` +
        `(FLEET-VISIBILITY-F4583).`,
    );
  }

  if (!demoRe.test(src.weekly)) {
    failures.push(
      `${FILES.weekly}: profitPerTruckWeeklyQuery must apply excludeDemoPhantomSql("u.unit_number") ` +
        `— demo/phantom fixture units would surface real weekly per-truck profit.`,
    );
  }
  if (!sampleRe.test(src.weekly)) {
    failures.push(
      `${FILES.weekly}: profitPerTruckWeeklyQuery must apply excludeSampleDataSql("u.is_sample_data") ` +
        `— sample-tagged fixture units would surface real weekly per-truck profit (FLEET-VISIBILITY-F4583).`,
    );
  }

  if (!demoRe.test(src.cpm)) {
    failures.push(
      `${FILES.cpm}: the per-truck CPM query must apply excludeDemoPhantomSql("u.unit_number") — ` +
        `demo/phantom fixture units would surface real cost-per-mile figures.`,
    );
  }
  if (!sampleRe.test(src.cpm)) {
    failures.push(
      `${FILES.cpm}: the per-truck CPM query must apply excludeSampleDataSql("u.is_sample_data") — ` +
        `sample-tagged fixture units would surface real cost-per-mile figures (FLEET-VISIBILITY-F4583).`,
    );
  }

  return failures;
}

function loadSrc(root) {
  return {
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
    weekly: fs.readFileSync(path.join(root, FILES.weekly), "utf8"),
    cpm: fs.readFileSync(path.join(root, FILES.cpm), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { key: "routes", from: '\n              AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { key: "routes", from: '\n              AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
    { key: "routes", from: '\n            AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { key: "routes", from: '\n            AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
    { key: "weekly", from: '\n          AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { key: "weekly", from: '\n          AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
    { key: "cpm", from: '\n        AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { key: "cpm", from: '\n        AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutatedSrc = { ...good, [m.key]: good[m.key].split(m.from).join(m.to) };
    if (mutatedSrc[m.key] === good[m.key]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m)}`);
      process.exit(1);
    }
    if (audit(mutatedSrc).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m)}`);
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
console.log(`${LABEL} PASS — profit-per-truck and per-truck-CPM reports exclude demo/phantom + is_sample_data fixture units`);
