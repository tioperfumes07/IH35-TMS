#!/usr/bin/env node
/**
 * ROUND 303 T-37 — GUARD.
 *
 * "the PM auto-WO cron creates a work order against a truck that does not exist, inside USMCA,
 * on every tick, forever." "A writer that CAN reach a sample row is a defect whether or not one
 * exists today."
 *
 * FAILS IF any of these PM writer/selector files loses its is_sample_data exclusion:
 *   - pm-auto-engine.service.ts (listActiveSchedules — the cron itself)
 *   - pm-due-engine.service.ts (Round 301 T-29 — must also exclude sample units, and must treat
 *     a last_service_odometer <= 1 placeholder as ABSENT, never a guessed baseline)
 *   - pm-schedule.routes.ts (CREATE route, LIST route, and the manual generate-wo writer)
 *   - maintenance-predictor.service.ts (the webhook-path alert trigger)
 *   - service-history-backfill.routes.ts (the manual backfill writer)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const FILES_REQUIRING_SAMPLE_EXCLUSION = [
  "apps/backend/src/maintenance/pm-auto-engine.service.ts",
  "apps/backend/src/maintenance/pm-due-engine.service.ts",
  "apps/backend/src/maintenance/pm-schedule.routes.ts",
  "apps/backend/src/telematics/maintenance-predictor.service.ts",
  "apps/backend/src/maintenance/service-history-backfill.routes.ts",
];

const SAMPLE_EXCLUSION_RE = /is_sample_data,?\s*false\)\s*=\s*false|is_sample_data\s+IS\s+NOT\s+TRUE/i;

export function checkFileExcludesSampleUnits(source, label) {
  const problems = [];
  if (!SAMPLE_EXCLUSION_RE.test(source)) {
    problems.push(`${label} no longer excludes is_sample_data units from its PM writer/selector query.`);
  }
  return problems;
}

export function checkPlaceholderBaselineTreatedAsAbsent(source) {
  const problems = [];
  if (!/PLACEHOLDER_BASELINE_MAX_MILES/.test(source)) {
    problems.push("pm-due-engine.service.ts no longer treats a <=1-mile last_service_odometer as a placeholder/absent baseline.");
  }
  return problems;
}

export function run() {
  const problems = [];
  for (const rel of FILES_REQUIRING_SAMPLE_EXCLUSION) {
    const file = resolve(ROOT, rel);
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      problems.push(`${rel} does not exist.`);
      continue;
    }
    problems.push(...checkFileExcludesSampleUnits(source, rel));
    if (rel.endsWith("pm-due-engine.service.ts")) {
      problems.push(...checkPlaceholderBaselineTreatedAsAbsent(source));
    }
  }
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-pm-writers-exclude-sample-units: OK -- every PM writer/selector excludes sample units; placeholder baselines treated as absent."
        : `verify-pm-writers-exclude-sample-units FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    const failed = problems.length > 0;
    if (failed !== wantFail) {
      console.error(`SELFTEST FAIL: ${name} expected ${wantFail ? "a failure" : "no failure"}, got ${JSON.stringify(problems)}`);
      ok = false;
    }
  };

  expect("COALESCE form excluded", checkFileExcludesSampleUnits("AND COALESCE(u.is_sample_data, false) = false", "test"), false);
  expect("IS NOT TRUE form excluded", checkFileExcludesSampleUnits("WHERE u.is_sample_data IS NOT TRUE", "test"), false);
  expect("no exclusion at all", checkFileExcludesSampleUnits("WHERE ps.is_active = true", "test"), true);

  expect("placeholder constant present", checkPlaceholderBaselineTreatedAsAbsent("const PLACEHOLDER_BASELINE_MAX_MILES = 1;"), false);
  expect("placeholder constant missing", checkPlaceholderBaselineTreatedAsAbsent("const x = 1;"), true);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-pm-writers-exclude-sample-units selftest PASS" : "verify-pm-writers-exclude-sample-units selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
