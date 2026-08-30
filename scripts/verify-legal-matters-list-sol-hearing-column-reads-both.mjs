#!/usr/bin/env node
// LEGAL-HEARING-LIST-COLUMN-STILL-READS-SOL-ONLY-AFTER-FIX: the Matters list's "SOL / hearing"
// column promises both a statute-of-limitations date AND a hearing date, but only ever read
// statute_of_limitations_at -- a matter with a real, active hearing deadline and no SOL date
// showed "—" even after the backend was fixed to derive next_hearing_date. Guard requires the
// column's render function to fall back to next_hearing_date when the SOL scalar is null.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx";

function inspect(source) {
  const failures = [];

  if (
    !/key: "statute_of_limitations_at"[\s\S]{0,900}displayDate = row\.statute_of_limitations_at \?\? row\.next_hearing_date/.test(
      source
    )
  ) {
    failures.push('the "SOL / hearing" column does not fall back to next_hearing_date when statute_of_limitations_at is null');
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-legal-matters-list-sol-hearing-column-reads-both --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    "const displayDate = row.statute_of_limitations_at ?? row.next_hearing_date;",
    "const displayDate = row.statute_of_limitations_at;"
  );
  if (mutated === real) {
    console.error("verify-legal-matters-list-sol-hearing-column-reads-both --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-legal-matters-list-sol-hearing-column-reads-both --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-legal-matters-list-sol-hearing-column-reads-both --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-legal-matters-list-sol-hearing-column-reads-both FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-legal-matters-list-sol-hearing-column-reads-both: OK — the SOL / hearing column reads next_hearing_date when statute_of_limitations_at is null");
