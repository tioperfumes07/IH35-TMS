#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx";

function assert(src) {
  const problems = [];
  if (!/kind=\"customer\"/.test(src) || !/customer_id/.test(src)) {
    problems.push(`${PAGE}: Customer must EntityLink via customer_id`);
  }
  if (/Customer: \{event\.customer_name \?\? \"N\/A\"\}/.test(src)) {
    problems.push(`${PAGE}: must not render customer as plain name-only text when id exists`);
  }
  return problems;
}

const live = readFileSync(path.join(ROOT, PAGE), "utf8");
if (SELFTEST) {
  const planted = live.replace(/Customer:[\s\S]*?· Position/, 'Customer: {event.customer_name ?? "N/A"} · Position');
  if (!assert(planted).length) {
    console.error("SELFTEST FAIL — planted plain customer not caught");
    process.exit(1);
  }
  if (assert(live).length) {
    console.error("SELFTEST FAIL — live unclean");
    process.exit(1);
  }
  console.log("verify-saf-geofence-customer-entitylink SELFTEST PASS");
  process.exit(0);
}
const problems = assert(live);
if (problems.length) {
  console.error("verify-saf-geofence-customer-entitylink FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("verify-saf-geofence-customer-entitylink OK");
