#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leaves":["dispatch.load_detail.profitability"]} */
/**
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): computeLoadProfitability's per-load insurance
 * cost allocation (GET /api/v1/dispatch/loads/:loadId/profitability and
 * GET /api/v1/reports/trip-profitability) divides the fleet's annual insurance premium by an
 * "active_unit_count" read from mdata.units with zero demo/phantom or is_sample_data exclusion.
 * Live-measured on prod 2026-08-24 (Neon tiny-field-89581227, USMCA): unfiltered count 44 vs.
 * correctly-excluded 38 -- fixture units inflate the denominator, understating the insurance cost
 * allocated to every load and correspondingly overstating every load's apparent profitability.
 *
 * Self-test: node scripts/verify-load-profitability-insurance-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/load-profitability.service.ts",
};
const LABEL = "verify-load-profitability-insurance-excludes-sample-data";

export function audit(src) {
  const failures = [];
  const match = src.service.match(/AS active_unit_count/);
  if (!match) {
    failures.push(`${FILES.service}: the active_unit_count subquery not found (re-anchor)`);
    return failures;
  }
  // The predicates are built INLINE in the same SELECT line, before "AS active_unit_count" — search
  // the line containing that alias for both calls.
  const lineStart = src.service.lastIndexOf("\n", src.service.indexOf("AS active_unit_count"));
  const line = src.service.slice(lineStart, src.service.indexOf("AS active_unit_count") + "AS active_unit_count".length);
  if (!/excludeDemoPhantomSql\(\s*["']u\.unit_number["']\s*\)/.test(line)) {
    failures.push(
      `${FILES.service}: active_unit_count must apply excludeDemoPhantomSql("u.unit_number") — a ` +
        `demo/phantom fixture unit would inflate the insurance-allocation denominator.`,
    );
  }
  if (!/excludeSampleDataSql\(\s*["']u\.is_sample_data["']\s*\)/.test(line)) {
    failures.push(
      `${FILES.service}: active_unit_count must apply excludeSampleDataSql("u.is_sample_data") — a ` +
        `sample-tagged fixture unit would inflate the insurance-allocation denominator, understating ` +
        `insurance cost and overstating every load's apparent profitability (FLEET-VISIBILITY-F4583).`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { from: ' AND ${excludeDemoPhantomSql("u.unit_number")}', to: "" },
    { from: ' AND ${excludeSampleDataSql("u.is_sample_data")}', to: "" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutatedService = good.service.split(m.from).join(m.to);
    if (mutatedService === good.service) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from)}`);
      process.exit(1);
    }
    if (audit({ service: mutatedService }).length === 0) {
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
console.log(`${LABEL} PASS — load-profitability insurance allocation excludes demo/phantom + is_sample_data fixture units`);
