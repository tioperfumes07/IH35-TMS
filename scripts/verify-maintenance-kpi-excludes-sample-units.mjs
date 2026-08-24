#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["maintenance.kpi.exclude_sample"],"task":"FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP","vertical":"class-sweep"} */
/**
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): the maintenance MTBF/summary KPI
 * (GET /api/v1/maintenance/kpi/summary, /mtbf) derives its operating-hours denominator from
 * countActiveUnits() and its downtime numerator from an OOS-hours query, both reading mdata.units
 * with no demo/phantom or is_sample_data exclusion — unlike the Fleet roster/KPI (already fixed,
 * same class). A fixture unit (e.g. "CODEX-AUDIT-UNIT-...", is_sample_data=true) would silently
 * inflate operatingHours, making MTBF read artificially healthier than the real fleet, or (if a
 * fixture were ever marked is_oos=true) inflate downtime_hours falsely.
 *
 * Self-test: node scripts/verify-maintenance-kpi-excludes-sample-units.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/maintenance/kpi.routes.ts",
};
const LABEL = "verify-maintenance-kpi-excludes-sample-units";

export function audit(src) {
  const failures = [];

  const oosMatch = src.routes.match(/FROM mdata\.units u[\s\S]*?u\.oos_since::date <= \$3::date[\s\S]*?`/);
  if (!oosMatch) {
    failures.push(`${FILES.routes}: the OOS-hours mdata.units query not found (re-anchor)`);
  } else {
    if (!/excludeDemoPhantomSql\(\s*["']u\.unit_number["']\s*\)/.test(oosMatch[0])) {
      failures.push(
        `${FILES.routes}: OOS-hours query must apply excludeDemoPhantomSql("u.unit_number") — a ` +
          `demo/phantom fixture unit marked is_oos could inflate downtime_hours.`,
      );
    }
    if (!/excludeSampleDataSql\(\s*["']u\.is_sample_data["']\s*\)/.test(oosMatch[0])) {
      failures.push(
        `${FILES.routes}: OOS-hours query must apply excludeSampleDataSql("u.is_sample_data") — a ` +
          `sample-tagged fixture unit marked is_oos could inflate downtime_hours.`,
      );
    }
  }

  const countMatch = src.routes.match(/async function countActiveUnits[\s\S]*?\n\}/);
  if (!countMatch) {
    failures.push(`${FILES.routes}: countActiveUnits() not found (re-anchor)`);
  } else {
    if (!/excludeDemoPhantomSql\(\s*["']unit_number["']\s*\)/.test(countMatch[0])) {
      failures.push(
        `${FILES.routes}: countActiveUnits() must apply excludeDemoPhantomSql("unit_number") — a ` +
          `demo/phantom fixture unit would inflate the MTBF operating-hours denominator.`,
      );
    }
    if (!/excludeSampleDataSql\(\)/.test(countMatch[0])) {
      failures.push(
        `${FILES.routes}: countActiveUnits() must apply excludeSampleDataSql() — a sample-tagged ` +
          `fixture unit would inflate the MTBF operating-hours denominator, making MTBF read ` +
          `artificially healthier than the real fleet.`,
      );
    }
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
  const mutatedOos = {
    ...good,
    routes: good.routes.replace(
      '            AND ${excludeDemoPhantomSql("u.unit_number")}\n            AND ${excludeSampleDataSql("u.is_sample_data")}\n',
      "",
    ),
  };
  if (mutatedOos.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — OOS pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutatedOos).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — OOS mutation escaped`);
    process.exit(1);
  }
  const mutatedCount = {
    ...good,
    routes: good.routes.replace(
      '        AND ${excludeDemoPhantomSql("unit_number")}\n        AND ${excludeSampleDataSql()}`,',
      "`,",
    ),
  };
  if (mutatedCount.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — countActiveUnits pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutatedCount).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — countActiveUnits mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — maintenance MTBF/summary KPI excludes demo/phantom + is_sample_data fixture units`);
