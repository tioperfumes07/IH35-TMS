#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["misc.trip_profit"],"task":"DISP-F5866-TRIP-PROFIT-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
import fs from "node:fs";

const files = {
  service: "apps/backend/src/dispatch/load-profitability.service.ts",
  api: "apps/frontend/src/lib/loadProfit.ts",
  page: "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
  matrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  self: "scripts/verify-trip-profitability-driver-link.mjs",
};
const HEADER = '/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["misc.trip_profit"],"task":"DISP-F5866-TRIP-PROFIT-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';
const checks = [
  ["settlement query driver FK", "service", /s\.driver_id::text AS driver_id/, false],
  ["profitability projection driver FK", "service", /t\.driver_id/, false],
  ["serializer driver FK", "service", /driver_id:\s*r\.driver_id \? String\(r\.driver_id\) : null/, false],
  ["client driver FK type", "api", /driver_id:\s*string \| null/, false],
  ["report driver tombstone-safe drill", "page", /<EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/, false],
  ["report error suppresses stale rows", "page", /const rows = query\.isError \? \[\] : \(query\.data\?\.rows \?\? \[\]\)/, false],
  ["report error suppresses stale totals", "page", /const t = query\.isError \? undefined : query\.data\?\.totals/, false],
  ["report does not discard driver FK", "page", /entityLabel\(row\.driver_name, null, "Driver"\)/, true],
];
const original = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  const failures = checks
    .filter(([, key, pattern, forbidden]) => forbidden ? pattern.test(sources[key]) : !pattern.test(sources[key]))
    .map(([name]) => name);
  try {
    const leaf = JSON.parse(sources.matrix).leaves?.find((item) => item.id === "misc.trip_profit");
    if (!leaf?.required?.includes("reverse_link")) failures.push("exact Required reverse ownership");
  } catch { failures.push("dispatch Required matrix parses"); }
  if (!sources.self.split("\n").includes(HEADER)) failures.push("exact Built annotation");
  return failures;
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
  const missingRequired = { ...original, matrix: original.matrix.replace('"id": "misc.trip_profit"', '"id": "misc.trip_profit.removed"') };
  if (!audit(missingRequired).includes("exact Required reverse ownership")) throw new Error("selftest failed to catch Required loss");
  caught += 1;
  const wrongHeader = { ...original, self: original.self.replace('"leaves":["misc.trip_profit"]', '"leaves":["misc.layover"]') };
  if (!audit(wrongHeader).includes("exact Built annotation")) throw new Error("selftest failed to catch header drift");
  caught += 1;
  console.log(`verify-trip-profitability-driver-link SELFTEST PASS — ${caught}/${checks.length + 2} runtime/matrix/header mutations detected`);
  process.exit(0);
}

console.log("verify-trip-profitability-driver-link PASS — settlement driver FK reaches the canonical report link");
