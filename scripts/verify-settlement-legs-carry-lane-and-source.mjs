#!/usr/bin/env node
/**
 * GUARD — S-01. A driver settlement leg must print the LANE and its mileage SOURCE, never a
 * bookkeeping memo and never an unlabelled number.
 *
 * MEASURED LIVE before the fix (br-fancy-credit-akjnd07a, USMCA
 * 5c854333-6ea5-4faa-af31-67cb272fef80, 2026-09-30):
 *   driver_finance.driver_bills          138 rows, all with load_id and load_number
 *     miles_basis populated               99
 *     rate_per_mile_cents populated       97
 *   the lane column printed `notes`, which on every backfilled bill reads
 *     "Historical backfill from settlement 5797 - amount as printed"
 *   while the trip itself sat in mdata.loads / mdata.load_stops, e.g. bill 13577:
 *     miles_practical 1435.9 (source History), UNION, SC -> Laredo, TX, PU 09/01 DEL 09/05
 *
 * AFTER the fix, same live data: miles present on 136 of 136 non-void bills, lane on 117.
 *
 * THE PROPERTY:
 *  - the query resolves lane / pickup_at / delivery_at from mdata.load_stops
 *  - a mileage filled from mdata.loads is labelled "(load)" and never passes as the agreed basis
 *  - a rate divided out of gross / miles is flagged rate_is_effective and printed " eff"
 *  - the memo is a LAST fallback, never the primary lane
 *
 * SELFTEST: --selftest plants each regression and requires the guard to catch it.
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/driver-finance/settlements.service.ts";

export function checkSettlementLegs(source) {
  const failures = [];

  if (!/AS\s+lane\b/.test(source) || !/origin_label/.test(source) || !/dest_label/.test(source)) {
    failures.push("the lane must be resolved from mdata.load_stops (origin_label -> dest_label), not from a memo");
  }
  if (!/AS\s+pickup_at\b/.test(source) || !/AS\s+delivery_at\b/.test(source)) {
    failures.push("pickup_at and delivery_at must be selected, so a leg can print the dates the trip actually ran");
  }
  if (!/'practical \(load\)'/.test(source) || !/'short \(load\)'/.test(source)) {
    failures.push("a mileage filled from mdata.loads must be labelled '(load)' — an unlabelled mileage cannot be audited");
  }
  if (!/COALESCE\(db\.miles_basis,\s*dbl\.miles_practical,\s*dbl\.miles_shortest\)/.test(source)) {
    failures.push("miles_basis must fall back to mdata.loads; the bill's own basis still wins");
  }
  if (!/rate_is_effective/.test(source)) {
    failures.push("a rate divided out of gross / miles must be flagged rate_is_effective, never printed as a contracted rate");
  }
  if (!/row\.rate_is_effective\s*\?\s*" eff"/.test(source)) {
    failures.push("the rendered rate must carry the ' eff' suffix when it is effective rather than agreed");
  }
  if (!/basisLabel\s*\?\s*`\s*\(\$\{basisLabel\}\)`/.test(source)) {
    failures.push("the rendered mileage must carry its basis label");
  }
  // the memo must not be the primary lane again
  if (/const lane = String\(row\.notes/.test(source)) {
    failures.push("the lane reverted to row.notes — that is the backfill memo, not the trip the driver ran");
  }
  if (!/laneLabel \? `\$\{laneLabel\}/.test(source)) {
    failures.push("the lane label from load_stops must be preferred over the memo fallback");
  }

  return failures;
}

const NAME = "verify-settlement-legs-carry-lane-and-source";

if (process.argv.includes("--selftest")) {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    ["baseline (unmodified source)", good, 0],
    ["lane reverts to the memo", good.replace(/const lane = laneLabel \?[^\n]*\n/, 'const lane = String(row.notes ?? "Driver bill");\n'), 1],
    ["the load_stops lane subqueries are removed", good.replace(/origin_label/g, "x_removed"), 1],
    ["pickup/delivery dates dropped", good.replace(/AS pickup_at/g, "AS px_removed"), 1],
    ["mileage source label stripped", good.replace(/'practical \(load\)'/g, "'practical'"), 1],
    ["miles no longer fall back to mdata.loads", good.replace("COALESCE(db.miles_basis, dbl.miles_practical, dbl.miles_shortest)", "db.miles_basis"), 1],
    ["effective-rate flag dropped from the render", good.replace(/\$\{row\.rate_is_effective \? " eff" : ""\}/, ""), 1],
  ];

  let ok = 0;
  for (const [label, src, expectMin] of cases) {
    const found = checkSettlementLegs(src).length;
    const pass = expectMin === 0 ? found === 0 : found >= expectMin;
    if (pass) ok += 1;
    else console.error(`  selftest MISS: ${label} -> ${found} failure(s), expected ${expectMin === 0 ? "0" : ">=1"}`);
  }
  console.log(`${NAME} selftest ${ok}/${cases.length} ${ok === cases.length ? "OK" : "FAILED"}`);
  if (ok !== cases.length) process.exit(1);
  console.log("--- live ---");
}

const failures = checkSettlementLegs(readFileSync(FILE, "utf8"));
if (failures.length > 0) {
  console.error(`${NAME} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${NAME} PASS — settlement legs carry the lane, the dates, and the mileage/rate source`);
