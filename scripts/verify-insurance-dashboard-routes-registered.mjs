#!/usr/bin/env node
/** Ratchets the insurance dashboard summary route across every FE/BE hop. */
import { readFileSync } from "node:fs";

const FILES = {
  landing: "apps/frontend/src/pages/insurance/InsuranceLanding.tsx",
  api: "apps/frontend/src/api/insurance.ts",
  route: "apps/backend/src/insurance/summary.routes.ts",
  index: "apps/backend/src/index.ts",
};
const CHECKS = [
  ["landing:summary-client", "landing", /getInsuranceSummary/],
  ["api:summary-path", "api", /\/api\/v1\/insurance\/summary/],
  ["route:registered-get", "route", /app\.get\("\/api\/v1\/insurance\/summary"/],
  ["index:route-mounted", "index", /registerInsuranceSummaryRoutes\(app\)/],
];

export function collectProblems(sources) {
  return CHECKS.filter(([, key, pattern]) => !pattern.test(sources[key] ?? "")).map(([id]) => id);
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, readFileSync(path, "utf8")]));
}

function selftest() {
  const baseline = readSources();
  const missed = [];
  for (const [id, key, pattern] of CHECKS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const mutated = { ...baseline, [key]: baseline[key].replace(new RegExp(pattern.source, flags), "__PLANTED_DEFECT__") };
    if (!collectProblems(mutated).includes(id)) missed.push(id);
  }
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-insurance-dashboard-routes-registered --selftest ${CHECKS.length}/${CHECKS.length}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = collectProblems(readSources());
  if (failures.length) {
    console.error(`verify-insurance-dashboard-routes-registered FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-insurance-dashboard-routes-registered PASS — landing→API→GET route→server mount");
}
