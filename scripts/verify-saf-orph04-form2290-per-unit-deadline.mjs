#!/usr/bin/env node
/**
 * GUARD — SAF-ORPH-04 closure. Form 2290 upcoming deadline must be per-unit (IRS: last day of the
 * month following first use) with weekend/holiday business-day shift — not company-wide Aug 31 alone.
 *
 * Step 1500 proves the date MATH. Step 1618 proves form2290DueDateForFirstUse() has a backend caller.
 * Step 1917 proves Permits.tsx does not hardcode Aug 31. This step closes the product gap: the Safety
 * Permits banner and Form 2290 filings chrome must SURFACE per_unit_deadlines from the API, or a truck
 * first used in October (due Nov 30) vanishes behind the annual Aug 31 line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:saf-orph04-form2290-per-unit-deadline";

const PERMITS = "apps/frontend/src/pages/safety/Permits.tsx";
const FILINGS = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";
const ROUTES = "apps/backend/src/compliance/form-2290.routes.ts";
const GENERATOR = "apps/backend/src/compliance/form-2290-generator.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function run(root = ROOT) {
  const failures = [];
  const permits = read(PERMITS);
  const filings = read(FILINGS);
  const routes = read(ROUTES);
  const generator = read(GENERATOR);

  if (!permits.includes("per_unit_deadlines")) {
    failures.push(`${PERMITS}: must read per_unit_deadlines from the upcoming-deadline API (SAF-ORPH-04)`);
  }
  if (!permits.includes("units_missing_first_use")) {
    failures.push(`${PERMITS}: must surface units_missing_first_use when first-use date is absent`);
  }
  if (!permits.includes("due on a different date")) {
    failures.push(`${PERMITS}: must render per-unit deadline exceptions in the Safety banner`);
  }
  if (!permits.includes("SAF-ORPH-04")) {
    failures.push(`${PERMITS}: keep SAF-ORPH-04 comment anchoring the per-unit rule`);
  }

  if (!filings.includes("per_unit_deadlines")) {
    failures.push(`${FILINGS}: must read per_unit_deadlines from the upcoming-deadline API`);
  }
  if (!filings.includes("due on a different date")) {
    failures.push(`${FILINGS}: must render per-unit deadline exceptions`);
  }

  if (!routes.includes("per_unit_deadlines:")) {
    failures.push(`${ROUTES}: upcoming-deadline response must include per_unit_deadlines`);
  }
  if (!/\bform2290DueDateForFirstUse\s*\(/.test(routes)) {
    failures.push(`${ROUTES}: must invoke form2290DueDateForFirstUse() for per-unit due dates`);
  }

  if (!generator.includes("nextBusinessDay")) {
    failures.push(`${GENERATOR}: must apply nextBusinessDay for weekend/holiday shift`);
  }
  if (!/nextBusinessDay\(lastDayOfNextMonth\)/.test(generator)) {
    failures.push(`${GENERATOR}: form2290DueDateForFirstUse must business-day-shift the per-unit due date`);
  }
  if (!/nextBusinessDay\(utc\(deadlineYear, 7, 31\)\)/.test(generator)) {
    failures.push(`${GENERATOR}: upcomingForm2290Deadline must business-day-shift the annual due date`);
  }

  return failures;
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };

  const clean = run();
  t("current tree passes", clean.length === 0);

  const permitsPath = path.join(ROOT, PERMITS);
  const original = read(PERMITS);
  try {
    const stripped = original.replace(/per_unit_deadlines/g, "deadline_only");
    fs.writeFileSync(permitsPath, stripped);
    t("missing per_unit_deadlines fails", run().some((f) => f.includes("per_unit_deadlines")));
  } finally {
    fs.writeFileSync(permitsPath, original);
  }

  console.log(bad === 0 ? `${LABEL} --selftest OK` : `${LABEL} --selftest FAILED (${bad})`);
  return bad;
}

const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("verify-saf-orph04-form2290-per-unit-deadline.mjs");
if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) process.exit(selftest());
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
