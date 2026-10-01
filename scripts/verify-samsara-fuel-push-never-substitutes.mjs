#!/usr/bin/env node
/**
 * ROUND 304 T-48 — GUARD. "Never push gallons <= 0 or a shared import timestamp; never substitute a
 * default, never estimate liters, never use the import time as the pump time."
 * FAILS IF fuel-purchase-push.service.ts:
 *   1. stops gating every row through fuelPurchaseIneligibleReason(..., { requirePumpTime: true });
 *   2. sets transactionReference to anything but our fuel_transactions id;
 *   3. builds transactionTime from anything but the row's own transaction_at, or (ORDERS 2026-10-01 row 7)
 *      CC-2's derived pump time at confidence 'high' for a date-only row (no now()/imported_at, no medium);
 *   4. derives litres from anything but the row's gallons;
 *   5. reads mdata.units before the integrations.samsara_vehicles mirror, or picks among ambiguous ids;
 *   6. can POST to Samsara outside apply mode.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/fuel-purchase-push.service.ts");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (!/fuelPurchaseIneligibleReason\(row, \{ requirePumpTime: true \}\)/.test(src)) p.push("rows are no longer gated by fuelPurchaseIneligibleReason with requirePumpTime: true.");
  if (!/transactionReference: row\.id,/.test(src)) p.push("transactionReference is no longer our fuel_transactions id.");
  if (/imported_at|Date\.now\(\)|new Date\(\)/.test(src)) p.push("the pusher references import time / the current clock -- pump time must be the row's transaction_at only.");
  if (!/transactionTime: at\.toISOString\(\)/.test(src) || !/const rawAt = useDerived \? row\.derived_time! : row\.transaction_at;/.test(src)) p.push("transactionTime is no longer the row's own transaction_at (or its high-confidence derived time).");
  if (!/if \(!derivedReady\) \{[\s\S]*?computeFuelTimeDerivations\(client/.test(src)) p.push("without the derivation table, E-23 no longer derives pump time by calling the shared derivation engine.");
  if (!/const useDerived = gate === "date_only_precision" && row\.derived_time != null && row\.derived_confidence === "high";/.test(src)) p.push("a derived pump time can be used below confidence 'high' or for a non-date-only row.");
  if (!/fuelQuantityLiters: \(gallons \* LITERS_PER_US_GALLON\)/.test(src) || !/const gallons = Number\(row\.gallons\)/.test(src)) p.push("litres are no longer the row's gallons converted -- never an estimate.");
  const mirrorAt = src.indexOf("FROM integrations.samsara_vehicles");
  const unitsAt = src.indexOf("FROM mdata.units");
  if (mirrorAt < 0 || unitsAt < 0 || mirrorAt > unitsAt) p.push("vehicle mapping is no longer mirror-first.");
  if (!/"ambiguous_samsara_vehicle"/.test(src)) p.push("a unit with several Samsara vehicle ids is no longer skipped as ambiguous.");
  if (!/if \(!opts\.apply\) continue;\s*if \(!opts\.poster\)/.test(src)) p.push("the Samsara POST is no longer fenced behind apply mode.");
  return p;
}

function selftest() {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    [good, false],
    [good.replaceAll("{ requirePumpTime: true }", "{ requirePumpTime: false }"), true],
    [good.replaceAll("transactionReference: row.id,", "transactionReference: String(Math.random()),"), true],
    [good.replaceAll("transactionTime: at.toISOString()", "transactionTime: new Date().toISOString()"), true],
    [good.replaceAll('row.derived_confidence === "high"', 'row.derived_confidence != null'), true],
    [good.replaceAll("computeFuelTimeDerivations(client", "x(client"), true],
    [good.replaceAll("(gallons * LITERS_PER_US_GALLON)", "(100)"), true],
    [good.replaceAll('"ambiguous_samsara_vehicle"', '"x"'), true],
    [good.replaceAll("if (!opts.apply) continue;", ""), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-fuel-push-never-substitutes selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-samsara-fuel-push-never-substitutes FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-fuel-push-never-substitutes: OK -- gated rows only, our id as reference, real pump time, real litres, mirror-first vehicle, POST only in apply mode.");
  process.exit(p.length ? 1 : 0);
}
