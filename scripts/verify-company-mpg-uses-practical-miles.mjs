#!/usr/bin/env node
/**
 * GUARD — M-01. The company settlement's MPG must not divide by miles_shortest alone.
 *
 * MEASURED LIVE (br-fancy-credit-akjnd07a, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80,
 * 2026-09-30):
 *   mdata.loads (not soft-deleted)   138
 *     with miles_shortest             29    SUM  45,587.1 mi
 *     with miles_practical           135    SUM 198,665.8 mi
 *   fuel.fuel_transactions           453 txns, 36,986.5 gal
 *
 *   same denominator, the two numerators:
 *     miles_shortest  ->  1.233 MPG     <- what the report was printing
 *     miles_practical ->  5.371 MPG
 *
 * SUM(miles_shortest) skipped 109 of 138 loads, so the numerator was a quarter of the miles the
 * trucks actually ran while the denominator stayed the full fuel purchase. A settlement showing
 * a fleet at 1.2 MPG is a wrong number on a financial report, wrong in the direction that makes
 * the fleet look like it burned fuel it never burned.
 *
 * THE PROPERTY: practical miles lead, shortest fills a gap, and the basis is REPORTED.
 *
 * SELFTEST: --selftest plants each regression and requires the guard to catch it.
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/accounting/company-settlement-report.service.ts";

export function checkCompanyMpg(source) {
  const failures = [];

  if (!/COALESCE\(SUM\(COALESCE\(miles_practical,\s*miles_shortest\)\),\s*0\)::text\s+AS\s+total_miles/.test(source)) {
    failures.push(
      "total_miles must be SUM(COALESCE(miles_practical, miles_shortest)) — miles_shortest is populated on 29 of 138 live loads"
    );
  }
  if (/SELECT\s+COALESCE\(SUM\(miles_shortest\),\s*0\)::text\s+AS\s+total_miles/.test(source)) {
    failures.push("total_miles reverted to SUM(miles_shortest) alone — that understated fleet MPG about 4.5x");
  }
  if (!/miles_basis/.test(source)) {
    failures.push("the mileage basis must be reported with the MPG; an MPG with no stated basis cannot be checked");
  }
  if (!/loads_missing_mileage/.test(source)) {
    failures.push("loads with no mileage at all must be surfaced, never silently counted as zero miles driven");
  }
  if (!/fuelGallonsTotal > 0 && totalMiles > 0/.test(source)) {
    failures.push("MPG must be null when either side is zero, rather than printing 0.000 as if it were measured");
  }

  return failures;
}

const NAME = "verify-company-mpg-uses-practical-miles";

if (process.argv.includes("--selftest")) {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    ["baseline (unmodified source)", good, 0],
    [
      "reverts to miles_shortest only",
      good.replace(
        /COALESCE\(SUM\(COALESCE\(miles_practical, miles_shortest\)\), 0\)::text AS total_miles/,
        "COALESCE(SUM(miles_shortest), 0)::text AS total_miles"
      ),
      1,
    ],
    ["the basis label is dropped", good.replace(/miles_basis/g, "x_removed"), 1],
    ["missing-mileage loads are hidden", good.replace(/loads_missing_mileage/g, "x_removed"), 1],
    ["MPG prints 0.000 instead of null", good.replace("fuelGallonsTotal > 0 && totalMiles > 0", "fuelGallonsTotal > 0"), 1],
  ];

  let ok = 0;
  for (const [label, src, expectMin] of cases) {
    const found = checkCompanyMpg(src).length;
    const pass = expectMin === 0 ? found === 0 : found >= expectMin;
    if (pass) ok += 1;
    else console.error(`  selftest MISS: ${label} -> ${found}, expected ${expectMin === 0 ? "0" : ">=1"}`);
  }
  console.log(`${NAME} selftest ${ok}/${cases.length} ${ok === cases.length ? "OK" : "FAILED"}`);
  if (ok !== cases.length) process.exit(1);
  console.log("--- live ---");
}

const failures = checkCompanyMpg(readFileSync(FILE, "utf8"));
if (failures.length > 0) {
  console.error(`${NAME} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${NAME} PASS — company MPG divides by practical miles and states its basis`);
