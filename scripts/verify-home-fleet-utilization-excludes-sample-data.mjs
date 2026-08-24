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
};
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

  const activeMatch = src.routes.match(/FROM mdata\.loads[\s\S]*?assigned_not_dispatched'\)[\s\S]*?`/);
  if (!activeMatch) {
    failures.push(`${FILES.routes}: the fleet-utilization active-units query not found (re-anchor)`);
  } else if (!/is_sample_data IS NOT TRUE/.test(activeMatch[0])) {
    failures.push(
      `${FILES.routes}: fleet-utilization active-units query must exclude is_sample_data loads — a ` +
        `sample load assigned to a unit would inflate the active-units numerator.`,
    );
  }

  return failures;
}

function loadSrc(root) {
  return {
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
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
    { from: "\n              AND is_sample_data IS NOT TRUE", to: "" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutatedRoutes = good.routes.split(m.from).join(m.to);
    if (mutatedRoutes === good.routes) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from)}`);
      process.exit(1);
    }
    if (audit({ routes: mutatedRoutes }).length === 0) {
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
