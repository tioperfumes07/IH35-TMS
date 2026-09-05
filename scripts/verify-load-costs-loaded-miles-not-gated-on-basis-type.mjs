#!/usr/bin/env node
// Owner ruling 2026-09-05 (measured on live 13508): the Load Costs board "Short Miles" column shows
// the LOADED miles the driver's bill is paid on = driver_bills.miles_basis, for a 'practical'-basis
// bill just as for a 'short'-basis one. loaded_pay_cents = miles_basis * rate_per_mile_cents, so
// miles_basis IS the loaded-leg mileage. The old query gated it on `miles_basis_type = 'short'`, which
// left Short Miles BLANK for the normal practical bill (13508: 1319.7 mi @ 48c -> $633.46 loaded pay,
// column empty). This guard pins the fix: the driver_pay_detail CTE maps short_miles to db.miles_basis
// and does NOT wrap it in a CASE gated on miles_basis_type.
//
// Usage: node scripts/verify-load-costs-loaded-miles-not-gated-on-basis-type.mjs [--selftest]
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/accounting/load-costs-board.routes.ts";

function audit(src) {
  const f = [];
  // The loaded-miles column must map straight to db.miles_basis.
  if (!/db\.miles_basis\s+AS\s+short_miles/.test(src))
    f.push(`${FILE}: Short Miles must map to db.miles_basis AS short_miles (the loaded miles the bill is paid on)`);
  // It must NOT be gated on the basis type (that blanks practical-basis bills).
  if (/CASE\s+WHEN\s+db\.miles_basis_type\s*=\s*'short'\s+THEN\s+db\.miles_basis\s+END\s+AS\s+short_miles/.test(src))
    f.push(`${FILE}: Short Miles must NOT be gated on miles_basis_type='short' — a practical-basis bill still has loaded miles`);
  // Empty Miles stays the deadhead leg.
  if (!/db\.miles_deadhead\s+AS\s+empty_miles/.test(src))
    f.push(`${FILE}: Empty Miles must map to db.miles_deadhead AS empty_miles`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(FILE, "utf8");
  const failures = audit(src);
  if (failures.length) {
    console.error("FAIL verify-load-costs-loaded-miles-not-gated-on-basis-type:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  if (selftest) {
    const m1 = src.replace(/db\.miles_basis\s+AS\s+short_miles/, "CASE WHEN db.miles_basis_type = 'short' THEN db.miles_basis END AS short_miles");
    if (audit(m1).length === 0) { console.error("SELFTEST FAIL: re-gating on basis type did not trip"); process.exit(1); }
    const m2 = src.replace(/db\.miles_basis\s+AS\s+short_miles/, "NULL AS short_miles");
    if (audit(m2).length === 0) { console.error("SELFTEST FAIL: blanking short_miles did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }
  console.log("PASS verify-load-costs-loaded-miles-not-gated-on-basis-type");
}
main();
