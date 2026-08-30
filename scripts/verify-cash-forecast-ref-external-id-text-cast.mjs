#!/usr/bin/env node
// CASH-FORECAST-REF-EXTERNAL-ID-TEXT-UUID-500: GET /api/v1/forecast/cash-entries's ref_external_id
// filter bound an unspecified-type parameter against forecast.cash_entries.ref_external_id (a plain
// TEXT column, migration 202606161800), while the query validator accepts a UUID-shaped string (unit
// ids) -- Postgres inferred `uuid` for the bare param and threw "operator does not exist: text =
// uuid" (42883), the exact same class already fixed on party_ref_id two lines above (CUST-F5985) but
// never applied here. Guard requires the WHERE-clause comparison to bind ref_external_id as ::text.
import fs from "node:fs";

const FILE = "apps/backend/src/forecast/cash-forecast-manual.routes.ts";

function inspect(source) {
  const failures = [];
  if (!/filters\.push\(`ref_external_id = \$\$\{values\.length\}::text`\)/.test(source)) {
    failures.push("GET /forecast/cash-entries's ref_external_id filter no longer casts ::text");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-cash-forecast-ref-external-id-text-cast --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    "filters.push(`ref_external_id = $${values.length}::text`)",
    "filters.push(`ref_external_id = $${values.length}`)"
  );
  if (mutated === real) {
    console.error("verify-cash-forecast-ref-external-id-text-cast --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-cash-forecast-ref-external-id-text-cast --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-cash-forecast-ref-external-id-text-cast --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-cash-forecast-ref-external-id-text-cast FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-cash-forecast-ref-external-id-text-cast: OK — ref_external_id filter binds as ::text, matching the already-fixed party_ref_id pattern");
