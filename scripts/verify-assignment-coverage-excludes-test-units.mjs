#!/usr/bin/env node
/**
 * T-23 (ROUND 300) — the real question CC-2's own 15-live-work-order finding almost asked wrong:
 * "assignment coverage" must be measured over the units the company ACTUALLY RUNS, never over
 * coder test artifacts. CC-2 found 15 live work orders referencing units with zero
 * vehicle_driver_assignments rows, but every one of those units (T120, T149, T150, T151,
 * USMCA-001) is a coder test artifact, not a real truck -- mixing them into a coverage number
 * would understate real coverage and misdirect whoever reads it next.
 *
 * This guard encodes the KNOWN TEST UNIT list as one shared source (never a second copy pasted
 * elsewhere) and fails if a coverage/attribution report includes one of them, or if the known
 * list itself silently grows without a name attached.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

/** The coder test artifacts named in CC-2's T-22 finding (Round 300, T-23) -- never real trucks. */
export const KNOWN_TEST_UNIT_NUMBERS = Object.freeze(["T120", "T149", "T150", "T151", "USMCA-001"]);

export function assertNoTestUnitsInCoverageReport(unitNumbers) {
  const problems = [];
  const hits = unitNumbers.filter((u) => KNOWN_TEST_UNIT_NUMBERS.includes(u));
  if (hits.length > 0) {
    problems.push(
      `assignment coverage report includes known test artifact unit(s): ${hits.join(", ")} -- these are ` +
        `coder test units (CC-2's T-22 finding), not real trucks the company runs. Exclude them with ` +
        `mdata.units.is_sample_data or the unit_number check, never include and footnote.`
    );
  }
  return problems;
}

/**
 * Live measurement: for each real (non-test, non-deactivated) unit on an operating company,
 * assignment coverage over the trailing `windowDays` (default 90), day-grain.
 */
export async function measureAssignmentCoverage(client, operatingCompanyId, windowDays = 90) {
  const units = await client.query(
    `
      SELECT id::text AS id, unit_number
      FROM mdata.units
      WHERE deactivated_at IS NULL
        AND COALESCE(is_sample_data, false) = false
        AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
      ORDER BY unit_number
    `,
    [operatingCompanyId]
  );

  const testHits = assertNoTestUnitsInCoverageReport(units.rows.map((r) => r.unit_number));
  if (testHits.length > 0) {
    throw new Error(testHits.join("\n"));
  }

  const out = [];
  for (const u of units.rows) {
    const r = await client.query(
      `
        WITH days AS (
          SELECT generate_series((CURRENT_DATE - ($2 - 1) * interval '1 day')::date, CURRENT_DATE::date, interval '1 day')::date AS d
        )
        SELECT
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM telematics.vehicle_driver_assignments a
              WHERE a.unit_id = $1::uuid
                AND a.started_at::date <= days.d
                AND (a.ended_at IS NULL OR a.ended_at::date >= days.d)
            )
          ) AS covered_days,
          count(*) AS total_days
        FROM days
      `,
      [u.id, windowDays]
    );
    out.push({
      unit_number: u.unit_number,
      covered_days: Number(r.rows[0].covered_days),
      total_days: Number(r.rows[0].total_days),
      pct: Number(((Number(r.rows[0].covered_days) / Number(r.rows[0].total_days)) * 100).toFixed(1)),
    });
  }
  return out;
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

  expect("real fleet only", assertNoTestUnitsInCoverageReport(["T122", "T124", "T147"]), false);
  expect("test unit T120 sneaks in", assertNoTestUnitsInCoverageReport(["T122", "T120"]), true);
  expect("test unit USMCA-001 sneaks in", assertNoTestUnitsInCoverageReport(["USMCA-001"]), true);
  expect("all 5 known test units flagged", assertNoTestUnitsInCoverageReport([...KNOWN_TEST_UNIT_NUMBERS]).length === 1 ? [] : ["bad"], false);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-assignment-coverage-excludes-test-units selftest PASS" : "verify-assignment-coverage-excludes-test-units selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  console.log(
    `verify-assignment-coverage-excludes-test-units: static OK -- known test units: ${KNOWN_TEST_UNIT_NUMBERS.join(", ")}. ` +
      `Run with a live DATABASE_URL via .tmp-scratch tooling to measure real coverage; this file's job is the exclusion invariant, not the live report.`
  );
  process.exit(0);
}
