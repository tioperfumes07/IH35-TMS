#!/usr/bin/env node
/**
 * Trip Pairing Board — TPB gear Customer / Miles / Revenue + unbooked driver_id / live now:.
 * Backend must join customers + loaded_miles + rate_total_cents; FE must EntityLink customer and
 * paint booked rate / miles (honest empty). Unbooked cards must expose driver_id and render
 * location from the payload (not a hard-coded "now: —").
 */
import fs from "node:fs";

const LABEL = "verify-trip-pairing-customer-miles-revenue";
const SVC = "apps/backend/src/dispatch/trip-pairing-board.service.ts";
const PAGE = "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx";
const API = "apps/frontend/src/api/dispatch.ts";

const svc = fs.readFileSync(SVC, "utf8");
const page = fs.readFileSync(PAGE, "utf8");
const api = fs.readFileSync(API, "utf8");
const fails = [];

if (!/LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(svc)) {
  fails.push(`${SVC}: must LEFT JOIN mdata.customers for customer_name`);
}
if (!/l\.loaded_miles::text AS loaded_miles/.test(svc) || !/l\.rate_total_cents::text AS rate_total_cents/.test(svc)) {
  fails.push(`${SVC}: must SELECT loaded_miles + rate_total_cents`);
}
if (!/customer_id: string \| null/.test(svc) || !/miles_total: number \| null/.test(svc) || !/rate_total_cents: number \| null/.test(svc)) {
  fails.push(`${SVC}: TripPairingUnitRow must declare customer_id / miles_total / rate_total_cents`);
}
if (!/driver_id: drv\?\.driver_id \?\? null/.test(svc) && !/driver_id: drv\?\.driver_id/.test(svc)) {
  fails.push(`${SVC}: unbooked push must include driver_id`);
}
if (!/customer_id: string \| null/.test(api) || !/miles_total: number \| null/.test(api) || !/rate_total_cents: number \| null/.test(api)) {
  fails.push(`${API}: TripPairingUnitRow must declare customer_id / miles_total / rate_total_cents`);
}
if (!/kind="customer"/.test(page) || !/t\.customer_id/.test(page)) {
  fails.push(`${PAGE}: Customer column must EntityLink kind=customer via customer_id`);
}
if (!/key: "miles_total"/.test(page) || !/key: "rate_total_cents"/.test(page)) {
  fails.push(`${PAGE}: must expose Miles + Revenue columns`);
}
if (!/formatUsdCentsTable\(t\.rate_total_cents\)/.test(page)) {
  fails.push(`${PAGE}: Revenue must format rate_total_cents via formatUsdCentsTable`);
}
if (/now: —/.test(page) && !/nowLabel/.test(page)) {
  fails.push(`${PAGE}: unbooked now: must use location payload, not hard-coded em dash`);
}
if (!/u\.location\?\.city/.test(page)) {
  fails.push(`${PAGE}: unbooked now: must read u.location city/state`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = page.replace(/kind="customer"/g, 'kind="vendor"').replace(/key: "miles_total"/g, 'key: "miles_gone"');
  if (/kind="customer"/.test(plant) || /key: "miles_total"/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Trip Pairing Customer/Miles/Revenue + unbooked location`);
