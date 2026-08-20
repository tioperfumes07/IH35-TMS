#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","load","connectivity","reverse_link"],"leafRe":"^misc\\.trip_profit$","task":"CLS-DISPATCH-TRIP-PROFIT-DRIVER-LINK"} */
import fs from "node:fs";

const files = {
  service: "apps/backend/src/dispatch/load-profitability.service.ts",
  api: "apps/frontend/src/lib/loadProfit.ts",
  page: "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
};
const checks = [
  ["settlement query driver FK", "service", /s\.driver_id::text AS driver_id/, false],
  ["profitability projection driver FK", "service", /t\.driver_id/, false],
  ["serializer driver FK", "service", /driver_id:\s*r\.driver_id \? String\(r\.driver_id\) : null/, false],
  ["client driver FK type", "api", /driver_id:\s*string \| null/, false],
  ["report driver tombstone-safe drill", "page", /<EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/, false],
  ["report does not discard driver FK", "page", /entityLabel\(row\.driver_name, null, "Driver"\)/, true],
];
const original = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks
    .filter(([, key, pattern, forbidden]) => forbidden ? pattern.test(sources[key]) : !pattern.test(sources[key]))
    .map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-trip-profitability-driver-link FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, pattern, forbidden] of checks) {
    const mutated = { ...original };
    mutated[key] = forbidden
      ? `${original[key]}\nentityLabel(row.driver_name, null, "Driver")`
      : original[key].replace(pattern, "__PLANTED_TRIP_DRIVER_DEFECT__");
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-trip-profitability-driver-link SELFTEST PASS — ${caught}/${checks.length} exact trip-driver mutations detected`);
  process.exit(0);
}

console.log("verify-trip-profitability-driver-link PASS — settlement driver FK reaches the canonical report link");
