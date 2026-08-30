#!/usr/bin/env node
// CUSTOMERS-QUALITY-SEGMENT-PAGER-TOTAL-STUCK-ON-ALL: listStatus collapses to "all" for the
// Preferred/Watch/Factored tabs (it only distinguishes active/inactive/all), so those 3 tabs'
// pager fell into the "all" branch (customersQuery.total + inactiveCustomersQuery.total) instead
// of the real, much smaller quality-segment count -- live-confirmed "Preferred (1)" showing a
// single row under a "1-31 of 31" pager. Guard requires customersServerTotal to check
// qualitySegment before falling into the listStatus branches.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/Customers.tsx";

function inspect(source) {
  const failures = [];

  if (
    !/const customersServerTotal =\s*\n\s*qualitySegment !== "all"\s*\n\s*\? customerTabCounts\[qualitySegment\]/.test(
      source
    )
  ) {
    failures.push("customersServerTotal does not check qualitySegment before falling into the listStatus branches");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-customers-quality-segment-pager-total --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    'const customersServerTotal =\n    qualitySegment !== "all"\n      ? customerTabCounts[qualitySegment]\n      : listStatus === "inactive"',
    'const customersServerTotal =\n    listStatus === "inactive"'
  );
  if (mutated === real) {
    console.error("verify-customers-quality-segment-pager-total --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-customers-quality-segment-pager-total --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-customers-quality-segment-pager-total --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-customers-quality-segment-pager-total FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-customers-quality-segment-pager-total: OK — customersServerTotal uses the real quality-segment count for Preferred/Watch/Factored tabs");
