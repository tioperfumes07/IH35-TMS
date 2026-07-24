#!/usr/bin/env node
/**
 * GUARD: an unresolved drug/alcohol violation blocks dispatch (SAF-F07 · 49 CFR §382.501).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * The shared driver-qualification gate enforced driver status, CDL, DOT medical card and the hazmat
 * H-endorsement — and consulted NOTHING about drug & alcohol. A driver who tested POSITIVE or REFUSED
 * a test could be assigned and dispatched through any of the four entry points (book-load,
 * quick-assign, planner, quicksave). The data was already being collected; the gate simply never read
 * it. Under §382.501 a driver is removed from safety-sensitive functions on a positive/refusal and
 * stays prohibited until the return-to-duty process completes.
 *
 * The assertions below pin the parts that are easy to "simplify" into a hole:
 *
 * 1. BOTH tables are read. safety.drug_test (0270) is what the office UI writes via
 *    POST /api/v1/safety/drug-program/tests; safety.da_test_records (0327) is the newer D&A program
 *    module. Both are live-written. Reading only one lets a positive recorded through the other path
 *    wave the driver straight through. (Which is canonical is an OPEN owner decision — until then the
 *    union is the only safe reading.)
 * 2. Refusal-equivalents count. FMCSA treats `adulterated` and `substituted` as refusals to test.
 *    Dropping them would let a driver who adulterated a sample keep driving.
 * 3. `cancelled` and `pending` are NOT violations — a cancelled test never happened, and a result
 *    that has not come back is not evidence of one. Blocking on them would be a false positive that
 *    grounds a clean driver.
 * 4. Clearance must be a return_to_duty NEGATIVE, strictly AFTER the violation. A later routine
 *    negative random does not end a prohibition, and `>=` instead of `>` would let a same-timestamp
 *    row silently clear the violation it accompanies.
 * 5. Voided drug_test rows are excluded — void-not-delete means a voided test is not evidence.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = "apps/backend/src/dispatch/driver-qualification.service.ts";
const LABEL = "verify-dispatch-drug-alcohol-gate";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertDispatchDrugAlcoholGate(sources) {
  const src = stripComments(sources?.[GATE] ?? read(GATE));
  const problems = [];

  // 1. The blocking reasons exist and are actually pushed.
  for (const reason of ["drug_alcohol_positive", "drug_alcohol_refusal"]) {
    if (!src.includes(`"${reason}"`)) {
      problems.push(`${GATE}: DriverQualificationReason has no "${reason}" — the gate cannot express a D&A block.`);
    }
  }
  if (!/reasons\.push\(\s*daBlock\.violation_kind/.test(src)) {
    problems.push(`${GATE}: an unresolved D&A violation is never pushed onto reasons — the query would run and its result be discarded, which is worse than not querying at all.`);
  }

  // 2. BOTH result tables are consulted.
  for (const [table, why] of [
    ["safety.drug_test", "what the office UI writes (POST /api/v1/safety/drug-program/tests)"],
    ["safety.da_test_records", "what the D&A program module writes"],
  ]) {
    if (!src.includes(table)) {
      problems.push(`${GATE}: does not read ${table} — ${why}, so a positive recorded there would not block dispatch.`);
    }
  }

  // 3. Refusal-equivalents are disqualifying.
  for (const value of ["'refusal'", "'adulterated'", "'substituted'", "'refused'"]) {
    if (!src.includes(value)) {
      problems.push(`${GATE}: ${value} is not treated as a disqualifying result — FMCSA counts adulterated/substituted as refusals to test.`);
    }
  }

  // 4. Non-violations must NOT be disqualifying.
  const violationsBlock = src.slice(src.indexOf("WITH violations AS"), src.indexOf("clearances AS"));
  if (violationsBlock) {
    for (const value of ["'cancelled'", "'pending'"]) {
      if (violationsBlock.includes(value)) {
        problems.push(`${GATE}: ${value} is being treated as a D&A violation — a cancelled/pending test is not evidence of one and would ground a clean driver.`);
      }
    }
  }

  // 5. Clearance semantics.
  if (!/test_type\s*=\s*'return_to_duty'/.test(src)) {
    problems.push(`${GATE}: clearance is not restricted to a return_to_duty test — a routine negative does not end a §382.501 prohibition.`);
  }
  if (!/c\.at\s*>\s*v\.at/.test(src)) {
    problems.push(`${GATE}: clearance is not required to be strictly AFTER the violation (c.at > v.at) — an equal timestamp would silently clear the violation it accompanies.`);
  }

  // 6. Voided tests are not evidence.
  if (!/dt\.voided_at IS NULL/.test(src)) {
    problems.push(`${GATE}: voided drug_test rows are not excluded — a voided test would still ground a driver (or clear one).`);
  }

  return problems;
}

if (SELFTEST) {
  const live = { [GATE]: read(GATE) };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertDispatchDrugAlcoholGate(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "second-table-dropped",
    { [GATE]: live[GATE].split("safety.da_test_records").join("safety.some_other_table") },
    "does not read safety.da_test_records"
  );
  expectCaught(
    "refusal-equivalents-dropped",
    { [GATE]: live[GATE].replace("'refusal', 'adulterated', 'substituted'", "'refusal'") },
    "'adulterated' is not treated as a disqualifying result"
  );
  expectCaught(
    "clearance-accepts-any-negative",
    { [GATE]: live[GATE].split("test_type = 'return_to_duty'").join("test_type IS NOT NULL") },
    "not restricted to a return_to_duty test"
  );
  expectCaught(
    "clearance-allows-equal-timestamp",
    { [GATE]: live[GATE].replace("c.at > v.at", "c.at >= v.at") },
    "strictly AFTER the violation"
  );
  expectCaught(
    "voided-tests-count-again",
    { [GATE]: live[GATE].split("AND dt.voided_at IS NULL").join("") },
    "voided drug_test rows are not excluded"
  );
  expectCaught(
    "result-computed-then-discarded",
    { [GATE]: live[GATE].replace(/reasons\.push\(daBlock\.violation_kind[^;]*;/, "void daBlock;") },
    "never pushed onto reasons"
  );
  expectCaught(
    "cancelled-becomes-a-violation",
    { [GATE]: live[GATE].replace("IN ('positive', 'refusal', 'adulterated', 'substituted')", "IN ('positive', 'refusal', 'adulterated', 'substituted', 'cancelled')") },
    "'cancelled' is being treated as a D&A violation"
  );

  const liveProblems = assertDispatchDrugAlcoholGate(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 7 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertDispatchDrugAlcoholGate();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — an unresolved D&A violation blocks dispatch across all four entry points (both result tables, refusal-equivalents, RTD-negative clearance)`);
