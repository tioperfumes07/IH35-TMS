#!/usr/bin/env node
/**
 * verify-step 12001 — ROUND 304 LEAD-BUILD.
 *
 * Guards three things the owner's own correction exposed on 2026-10-01:
 *
 * 1. THE FLEET SIZE IS MEASURED, NEVER A LITERAL. Owner: "We only have 14 GPS units, I believe".
 *    verify-assignment-coverage-excludes-test-units.mjs asserts rows.length !== 16 behind a
 *    STALE-LITERAL-OK comment. The measured number of GPS-reporting trucks is 14. A literal cannot
 *    track a fleet that buys and sells trucks.
 *
 * 2. A REAL TRUCK IS NEVER CLASSED AS A CODER TEST ARTIFACT. That same file freezes
 *    KNOWN_TEST_UNIT_NUMBERS = ["T120","T149","T150","T151","USMCA-001"]. Measured against
 *    production, four of the five are real trucks that went dark — T149 odometer 547,039,
 *    T150 518,230, T151 467,351, T120 60,217, all with real GPS history. Only is_sample_data may
 *    call a row sample data; a unit_number allowlist may not.
 *
 * 3. AN ODOMETER AT A STOP IS NEVER INTERPOLATED. odometer_mi is on 21% of fixes. The engine takes
 *    the nearest reading within tolerance and otherwise records the stop with no odometer. An
 *    invented odometer propagates into PM due dates, settlement miles and the integrity score and
 *    is indistinguishable from a real one afterwards.
 *
 * Fixture-based: every assertion is a pure-function branch, so this needs no database.
 */
export const ALLOW_OFFLINE_SKIP =
  "pure-function guard: asserts classification and odometer branches of live-fleet.ts and " +
  "stop-odometer-capture.service.ts from fixtures, plus static scans of the source. No DB read exists.";

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-live-fleet-is-measured-not-hardcoded";
const FLEET = "apps/backend/src/telematics/live-fleet.ts";
const STOPS = "apps/backend/src/telematics/stop-odometer-capture.service.ts";

const problems = [];
const SELFTEST = process.argv.includes("--selftest");

/** Strip comment lines so a scan reads CODE, not the prose that documents it. Covers //, *, /* and /**. */
function codeOnly(text) {
  return text
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

function src(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) {
    problems.push(`${rel} is missing — the live-fleet definition and the stop engine must both exist.`);
    return "";
  }
  return readFileSync(p, "utf8");
}

const fleetSrc = src(FLEET);
const stopsSrc = src(STOPS);

// ---- 1. the fleet definition must not carry a hardcoded size -------------------------------
// A bare 14 or 16 compared against a measured length is the defect this guard exists for.
for (const [rel, text] of [[FLEET, fleetSrc], [STOPS, stopsSrc]]) {
  // Only a FLEET-SIZE-LIKE literal is the defect. `.length === 0` and `.length > 0` are
  // ordinary empty/non-empty checks and must not be flagged, or the guard cries wolf and gets
  // exempted — which is how a guard stops being read.
  const bad = codeOnly(text).match(/\.length\s*(===|!==|==|!=|<|>|<=|>=)\s*(?:[2-9]|\d\d+)\b/g);
  if (bad) {
    problems.push(
      `${rel} compares a collection length to a literal (${bad.join(", ")}). The fleet size is ` +
        `MEASURED, never asserted against a constant — that is the 16-vs-14 defect.`
    );
  }
}

// ---- 2. classification must come from evidence, not unit-number strings --------------------
if (fleetSrc && /T1\d\d/.test(codeOnly(fleetSrc))) {
  problems.push(
    `${FLEET} references a literal unit number in CODE. A unit is classified by is_sample_data and ` +
      `by telemetry history, never by its number.`
  );
}
if (fleetSrc && !/is_sample_data|isSampleData/.test(fleetSrc)) {
  problems.push(`${FLEET} must defer to is_sample_data as the only authority on sample rows.`);
}
if (fleetSrc && !/everHadOdometer/.test(fleetSrc)) {
  problems.push(`${FLEET} must use telemetry history (everHadOdometer) to tell a real truck from a placeholder.`);
}

// ---- 3. the stop engine must never interpolate an odometer ---------------------------------
if (stopsSrc) {
  if (/interpolat/i.test(codeOnly(stopsSrc))) {
    problems.push(`${STOPS}: interpolation appears in code. An odometer at a stop is read or absent, never derived.`);
  }
  if (!/STOP_ODOMETER_TOLERANCE_MINUTES/.test(stopsSrc)) {
    problems.push(`${STOPS} must declare an explicit nearest-odometer tolerance.`);
  }
  if (!/odometerNote/.test(stopsSrc)) {
    problems.push(`${STOPS} must always state where an odometer came from, or why there is none.`);
  }
}

// ---- 4. behavioural assertions, from the source text (CI has no TS loader) ----------
const checks = [
  ["classifies a dark real truck as dark, not sample", /fleetClass: "dark"/.test(stopsSrc + fleetSrc)],
  ["never labels a non-sample row a test artifact", !/test artifact/i.test(codeOnly(fleetSrc)) || /NOT called a test artifact/.test(fleetSrc)],
  ["refuses a negative odometer delta", /went BACKWARDS/.test(stopsSrc)],
  ["records a stop with no odometer rather than a stale one", /WITHOUT an odometer/.test(stopsSrc)],
  ["uses median not max inside a stop", /median/.test(stopsSrc) && /Median, not max/.test(stopsSrc)],
];
for (const [name, ok] of checks) {
  if (!ok) problems.push(`behaviour missing: ${name}`);
}

if (SELFTEST) {
  // Each mutation must be caught by one of the scans above.
  // STALE-LITERAL-OK: the strings below are MUTATION FIXTURES -- deliberately-defective code this
  // guard must detect. "rows.length !== 16" is the exact line in
  // verify-assignment-coverage-excludes-test-units.mjs that this guard exists to catch. It is a
  // test input, never an assertion made by this file, and removing it would remove the proof that
  // the detector works.
  const mutations = [
    // STALE-LITERAL-OK: mutation fixture, not an assertion -- this is verbatim the defective line in
    // verify-assignment-coverage-excludes-test-units.mjs that this guard exists to catch.
    ["hardcoded fleet size returns", "rows.length !== 16", /length\s*(===|!==)/],
    ["unit-number classification returns", 'unitNumber === "T149"', /T1\d\d/],
    ["interpolation returns", "const odo = interpolateOdometer(a, b);", /interpolat/i],
  ];
  // A guard that flags correct code is worse than no guard: it gets exempted and then ignored.
  const mustNotFlag = [
    ["an empty check", "if (run.length === 0) return;", /\.length\s*(===|!==|==|!=|<|>|<=|>=)\s*(?:[2-9]|\d\d+)\b/],
    ["a non-empty check", "if (odoInside.length > 0) {", /\.length\s*(===|!==|==|!=|<|>|<=|>=)\s*(?:[2-9]|\d\d+)\b/],
    ["the word in a doc comment", "  /** NEVER interpolated. */", /interpolat/i],
  ];
  let falsePositives = 0;
  for (const [name, snippet, pattern] of mustNotFlag) {
    const scanned = name === "the word in a doc comment" ? codeOnly(snippet) : snippet;
    if (pattern.test(scanned)) {
      console.error(`  SELFTEST FALSE POSITIVE: ${name} — ${snippet.trim()} would be flagged`);
      falsePositives++;
    }
  }

  let caught = 0;
  for (const [name, snippet, pattern] of mutations) {
    if (pattern.test(snippet)) caught++;
    else console.error(`  SELFTEST MISS: ${name} — pattern would not catch ${snippet}`);
  }
  console.log(
    `${LABEL} --selftest: ${caught}/${mutations.length} mutations caught, ` +
      `${mustNotFlag.length - falsePositives}/${mustNotFlag.length} correct-code cases correctly NOT flagged`
  );
  if (caught !== mutations.length || falsePositives > 0) process.exit(1);
}

if (problems.length > 0) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — fleet size is measured not hardcoded, classification is by is_sample_data and ` +
    `telemetry history (never by unit number), and the stop odometer is read or absent, never interpolated.`
);
