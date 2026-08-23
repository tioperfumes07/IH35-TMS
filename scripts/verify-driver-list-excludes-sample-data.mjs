#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.picker.exclude_sample"],"task":"LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-PICKER-2026-08-23","vertical":"class-sweep"} */
/**
 * LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-PICKER-2026-08-23: GET /api/v1/mdata/drivers is the
 * canonical driver list/picker read — used by the Driver Hub Assign-Temp-Cover modal and every other
 * driver picker across the app. Root-caused live: it excluded archived and pseudo-system drivers but
 * NOT is_sample_data ones, so agent/QA fixture drivers ("CODEX ACTIVE FLEET TEST 20260821",
 * "TEST-DRIVER-1 SEED", etc.) were live and selectable in real dispatch/scheduling flows on
 * production. mdata.units (DISPATCH-4) and driver-scheduler.service.ts already had this exclusion;
 * this route did not. Data corrected live (13 fixture rows flagged is_sample_data=true); this guard
 * holds the read-path fix so it cannot regress.
 *
 * Self-test: node scripts/verify-driver-list-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/mdata/drivers.routes.ts",
};
const LABEL = "verify-driver-list-excludes-sample-data";

export function audit(src) {
  const failures = [];
  const handlerMatch = src.routes.match(
    /app\.get\("\/api\/v1\/mdata\/drivers",[\s\S]*?const result = await withCurrentUser\(authUser\.uuid, async \(client\) => \{[\s\S]*?\n\s*\}\);/,
  );
  if (!handlerMatch) {
    failures.push(`${FILES.routes}: GET /api/v1/mdata/drivers handler not found`);
    return failures;
  }
  const body = handlerMatch[0];
  if (!/filters\.push\("is_sample_data IS NOT TRUE"\)/.test(body)) {
    failures.push(
      `${FILES.routes}: GET /api/v1/mdata/drivers must exclude is_sample_data rows from the ` +
        `canonical driver list/picker read, matching units.routes.ts (DISPATCH-4) and ` +
        `driver-scheduler.service.ts — otherwise agent/QA fixture drivers surface live in every ` +
        `driver picker across the app`,
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
  const mutated = {
    ...good,
    routes: good.routes.replace('filters.push("is_sample_data IS NOT TRUE");', ""),
  };
  if (mutated.routes === good.routes) {
    console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — canonical driver list/picker read excludes is_sample_data fixture rows`);
