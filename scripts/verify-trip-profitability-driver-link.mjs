#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","load","connectivity","reverse_link"],"leafRe":"^misc\\.trip_profit$","task":"CLS-DISPATCH-TRIP-PROFIT-DRIVER-LINK"} */
import fs from "node:fs";

const service = fs.readFileSync("apps/backend/src/dispatch/load-profitability.service.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/lib/loadProfit.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/dispatch/TripProfitability.tsx", "utf8");
const failures = [];

if (!/s\.driver_id::text AS driver_id/.test(service)) failures.push("trip query must select settlement driver_id");
if (!/t\.driver_id/.test(service)) failures.push("outer profitability query must return driver_id");
if (!/driver_id:\s*r\.driver_id \? String\(r\.driver_id\) : null/.test(service)) failures.push("serializer must preserve driver_id");
if (!/driver_id:\s*string \| null/.test(api)) failures.push("client row type must carry driver_id");
if (!/<EntityLink kind="driver" id=\{row\.driver_id\}/.test(page)) failures.push("trip report must link driver FK");
if (/entityLabel\(row\.driver_name, null, "Driver"\)/.test(page)) failures.push("trip report must not discard driver FK");

if (failures.length) {
  console.error(`verify-trip-profitability-driver-link FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-trip-profitability-driver-link PASS — settlement driver FK reaches the canonical report link");
