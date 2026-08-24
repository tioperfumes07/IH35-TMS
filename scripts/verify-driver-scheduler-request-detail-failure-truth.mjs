#!/usr/bin/env node
// @matrix-built {"modules":["safety"],"cols":["driver","connectivity","reverse_link"],"leaves":["leave_requests.detail"],"task":"SAFETY-LEAVE-REQUEST-DETAIL-FAILURE-TRUTH"}
import fs from "node:fs";

const FILES = {
  page: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  required: "docs/specs/scoreboard/modules/safety.required.json",
};

const CHECKS = [
  ["route:mounted", "routes", /path="scheduler\/requests\/:id" element=\{<DriverSchedulerRequestDetailPage \/>\}/],
  ["page:company-query", "page", /getRequestDetail\(operatingCompanyId, id\)/],
  ["page:error-state", "page", /query\.isError[\s\S]{0,180}Couldn't load leave request/],
  ["page:retry", "page", /onRetry=\{\(\) => void query\.refetch\(\)\}/],
  ["page:not-found-after-success", "page", /!query\.isLoading && !query\.isError && !req/],
  ["page:driver-drill", "page", /EntityLinkOrTombstone kind="driver" id=\{String\(req\.driver_id/],
  ["required:leaf", "required", /"id": "leave_requests\.detail"[\s\S]{0,220}"route_hint": "\/safety\/scheduler\/requests\/:id"[\s\S]{0,220}"reverse_link"/],
];

export function collectProblems(sources) {
  return CHECKS.filter(([, key, pattern]) => !pattern.test(sources[key] ?? "")).map(([id]) => id);
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
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
  console.log(`verify-driver-scheduler-request-detail-failure-truth --selftest ${CHECKS.length}/${CHECKS.length}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = collectProblems(readSources());
  if (problems.length) {
    console.error(`verify-driver-scheduler-request-detail-failure-truth FAILED:\n${problems.map((problem) => ` - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-driver-scheduler-request-detail-failure-truth PASS — scoped detail failures precede not-found and the driver reverse drill remains mounted");
}
