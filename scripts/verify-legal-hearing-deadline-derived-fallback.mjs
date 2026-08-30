#!/usr/bin/env node
// LEGAL-HEARING-DEADLINES-INVISIBLE-ON-MATTER-AND-LIST: legal.matters.next_hearing_date /
// statute_of_limitations_at are standalone scalar columns addMatterDeadlineRow never writes, so a
// matter with a real, active legal.matter_deadlines row of the matching type stayed "—" on both
// the matter Overview and the Matters list. Guard requires both listMatters() and getMatter() to
// fall back to the earliest OPEN (completed_at IS NULL) deadline of the matching type when the
// scalar column is null -- a real hearing deadline that exists but is not reflected must be caught.
import fs from "node:fs";

const FILE = "apps/backend/src/legal/matters.service.ts";

function inspect(source) {
  const failures = [];

  if (
    !/deadline_type IN \('hearing', 'statute_of_limitations'\)[\s\S]{0,80}AND completed_at IS NULL[\s\S]{0,2500}next_hearing_date == null && derived\.hearing[\s\S]{0,300}statute_of_limitations_at == null && derived\.statute_of_limitations/.test(
      source
    )
  ) {
    failures.push("listMatters() does not derive next_hearing_date/statute_of_limitations_at from the earliest open matter_deadlines row when the scalar column is null");
  }

  if (
    !/earliestHearing = deadlines\.rows\.find\(\(d\) => d\.deadline_type === "hearing" && d\.completed_at == null\)[\s\S]{0,200}m\.next_hearing_date = earliestHearing\.deadline_at[\s\S]{0,600}earliestSol = deadlines\.rows\.find\([\s\S]{0,200}\(d\) => d\.deadline_type === "statute_of_limitations" && d\.completed_at == null[\s\S]{0,200}m\.statute_of_limitations_at = earliestSol\.deadline_at/.test(
      source
    )
  ) {
    failures.push("getMatter() does not derive next_hearing_date/statute_of_limitations_at from the earliest open matter_deadlines row when the scalar column is null");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-legal-hearing-deadline-derived-fallback --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  // Mutation 1: strip the listMatters() derivation block (simulate the pre-fix bug: a real
  // hearing deadline exists in matter_deadlines but listMatters never surfaces it).
  const mutated1 = real.replace(
    /\s*\/\/ LEGAL-HEARING-DEADLINES-INVISIBLE-ON-MATTER-AND-LIST: same derivation as listMatters[\s\S]*?\n(\s*return \{ matter, events: events\.rows, documents, deadlines: deadlines\.rows \};)/,
    "\n$1"
  );
  if (mutated1 === real) {
    console.error("verify-legal-hearing-deadline-derived-fallback --selftest: getMatter mutation regex did not match — update the test");
    process.exit(1);
  }
  const mutated1Failures = inspect(mutated1);
  if (mutated1Failures.length === 0) {
    console.error("verify-legal-hearing-deadline-derived-fallback --selftest FAILED: getMatter mutation was not caught");
    process.exit(1);
  }
  console.log("verify-legal-hearing-deadline-derived-fallback --selftest: OK (getMatter mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-legal-hearing-deadline-derived-fallback FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-legal-hearing-deadline-derived-fallback: OK — both listMatters() and getMatter() derive hearing/SOL dates from the earliest open matter_deadlines row when the scalar column is null");
