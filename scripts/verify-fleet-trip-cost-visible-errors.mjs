#!/usr/bin/env node
/** FLT-F6322 — Trip cost must reject incomplete input visibly and surface API failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/vehicle-profile/TripCostCalculator.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/destination\.trim\(\)\.length >= 3/.test(text), "destination must use backend-compatible minimum validation");
  need(/disabled=\{!destinationValid\}/.test(text), "Compute must be disabled until destination is valid");
  need(/mutation\.reset\(\)/.test(text), "editing must clear stale result/error state");
  need(/aria-describedby="vp-trip-cost-status"/.test(text) && /aria-live="polite"/.test(text), "input must reference an announced status region");
  need(/\{requestError \?[\s\S]{0,220}role="alert"/.test(text), "API failure must render a visible alert");
  need(/Couldn&apos;t compute trip cost/.test(text), "failure message must describe the failed action");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fleet-trip-cost-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("destination.trim().length >= 3", "destination.length >= 0"),
    source.replace("disabled={!destinationValid}", "disabled={false}"),
    source.replaceAll("mutation.reset();", ""),
    source.replace('aria-live="polite"', 'aria-live="off"'),
    source.replace("{requestError ?", "{false ?"),
    source.replace("Couldn&apos;t compute trip cost", "Request failed"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-trip-cost-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-trip-cost-visible-errors PASS — validation and API failures are operator-visible");
