#!/usr/bin/env node
// ROUND 443.31 (Lead, 2026-10-10): the driver pay card that prices a load is the card EFFECTIVE ON THE LOAD'S PICKUP
// DATE — never the newest card. Measured: Angel 52037e93's only card (48c) starts 2026-08-07 and priced load 13498
// (picked up 2026-08-03) at 606.67. No card on that date -> refused by name.
//
// Static, on apps/backend/src/dispatch/book-load.service.ts resolveDriverBasePayCents:
//   1. the pickup date is read from the first pickup stop before the card query;
//   2. the card query is bounded by that date: effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $3)
//      (inclusive end), and is passed the pickup date;
//   3. a superseded card still governs its own dates: (is_active OR effective_to IS NOT NULL), not bare is_active;
//   4. the old newest-card shape (is_active AND effective_to IS NULL ... ORDER BY effective_from DESC) is gone;
//   5. a refusal is named (no_pickup_date / no_rate_card_effective_on_pickup_date) and reaches the skipped audit.
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-pay-card-effective-on-pickup-date";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/book-load.service.ts";

export function check(src) {
  const f = [];
  const start = src.indexOf("async function resolveDriverBasePayCents(");
  if (start < 0) return [`${SVC}: resolveDriverBasePayCents not found`];
  const fn = src.slice(start, src.indexOf("\n}\n", start));
  const flat = fn.replace(/\s+/g, " ");
  const iPickup = flat.indexOf("FROM mdata.load_stops WHERE load_id = $1::uuid AND stop_type = 'pickup'");
  const iCard = flat.indexOf("FROM driver_finance.driver_pay_rates");
  if (iPickup < 0 || iCard < 0 || iPickup > iCard) f.push("the pickup date must be read from the first pickup stop before the card query");
  if (!flat.includes("AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date)")) f.push("the card query must be bounded by the pickup date (inclusive effective_to)");
  if (!/\[operatingCompanyId, driverId, pickupDate\]/.test(fn)) f.push("the card query must be passed the pickup date");
  if (!flat.includes("AND (is_active OR effective_to IS NOT NULL)")) f.push("a superseded (closed) card must still govern its own dates");
  if (/AND is_active AND effective_to IS NULL ORDER BY effective_from DESC/.test(flat)) f.push("the newest-card query is back");
  if (!fn.includes('"no_rate_card_effective_on_pickup_date"') || !fn.includes('"no_pickup_date"')) f.push("a refusal must be named");
  if (!/reason: lastRateCardRefusal\?\.reason \?\? skipReason,/.test(src)) f.push("the named refusal must reach the skipped_no_pay_rate audit");
  return f;
}

const read = () => fs.readFileSync(path.join(ROOT, SVC), "utf8");

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["newest card again", real.replace(/AND \(is_active OR effective_to IS NOT NULL\)\s*AND \$3::date IS NOT NULL\s*AND effective_from <= \$3::date\s*AND \(effective_to IS NULL OR effective_to >= \$3::date\)/, "AND is_active\n         AND effective_to IS NULL")],
    ["exclusive end", real.replace("(effective_to IS NULL OR effective_to >= $3::date)", "(effective_to IS NULL OR effective_to > $3::date)")],
    ["closed cards ignored", real.replace("AND (is_active OR effective_to IS NOT NULL)", "AND is_active")],
    ["date not passed", real.replace("[operatingCompanyId, driverId, pickupDate]", "[operatingCompanyId, driverId, null]")],
    ["refusal unnamed", real.replace("reason: lastRateCardRefusal?.reason ?? skipReason,", "reason: skipReason,")],
  ];
  for (const [name, s] of plants) {
    if (s === real) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — the pay card is the one effective on the pickup date (inclusive), refusals named`);
