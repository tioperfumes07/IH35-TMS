#!/usr/bin/env node
/**
 * ACC-15 (docs/bus/OWNER-DEFECT-REGISTER-2026-09-03.md) — "is_sample_data is not set by the
 * create paths." Live code re-check (2026-09-05, CC-2) on the fleet-unit create path
 * (apps/backend/src/mdata/units.routes.ts): `createUnitBodySchema` had no `is_sample_data` field
 * at all, and the INSERT never wrote the column — it silently relied on the DB default (false) —
 * AND no test/sample/demo-name detection existed on `unit_number`/`vin`, unlike the sibling
 * accounts.routes.ts fix (ACC-13) and vendors.routes.ts's own `looksLikeSampleDataName` call. The
 * route's own comment at line ~272 already names the live symptom: "TEST-U01-style fixtures with
 * is_sample_data=false leak into Dispatch OOS." Fixed by rejecting a test/sample/demo-named unit
 * in USMCA at create time (same pattern as ACC-13), going forward only — this does not touch or
 * backfill any existing row.
 *
 * This is the static half only (source-shape check, no DB read) — same convention as ACC-13's own
 * static half. A live re-count is not meaningful here: units are asset records, not GL balances,
 * and the going-forward guard is what ACC-15 actually asks for.
 *
 * Usage: node scripts/verify-acc15-no-test-units-in-usmca.mjs
 *        node scripts/verify-acc15-no-test-units-in-usmca.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-acc15-no-test-units-in-usmca";
const ROUTE_PATH = "apps/backend/src/mdata/units.routes.ts";

export function routeRejectsTestNamedUsmcaUnits(routeSrc) {
  return (
    routeSrc.includes("looksLikeSampleDataName") &&
    routeSrc.includes("USMCA_COMPANY_ID") &&
    /test_sample_demo_name_not_allowed_in_usmca/.test(routeSrc) &&
    /operatingCompanyId === USMCA_COMPANY_ID/.test(routeSrc)
  );
}

function selftest() {
  const ok =
    routeRejectsTestNamedUsmcaUnits(
      'import { looksLikeSampleDataName } from "x";\nimport { USMCA_COMPANY_ID } from "y";\nif (operatingCompanyId === USMCA_COMPANY_ID && looksLikeSampleDataName(b.unit_number)) throw new Error("test_sample_demo_name_not_allowed_in_usmca");'
    ) === true &&
    routeRejectsTestNamedUsmcaUnits("no guard here at all") === false;
  if (!ok) {
    console.error(`${LABEL}: SELFTEST FAIL — routeRejectsTestNamedUsmcaUnits() wrong`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

if (!fs.existsSync(ROUTE_PATH)) {
  console.error(`${LABEL}: FAIL — ${ROUTE_PATH} not found`);
  process.exit(1);
}
const routeSrc = fs.readFileSync(ROUTE_PATH, "utf8");
if (!routeRejectsTestNamedUsmcaUnits(routeSrc)) {
  console.error(`${LABEL}: FAIL — ${ROUTE_PATH} no longer rejects test/sample/demo-named units for USMCA`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — create route rejects test/sample/demo-named USMCA units`);
