#!/usr/bin/env node
// @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["photo_comparison.detail"],"task":"SAFETY-PHOTO-COMPARISON-DETAIL-FAILURE-TRUTH"}
import fs from "node:fs";

const FILES = {
  page: "apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  required: "docs/specs/scoreboard/modules/safety.required.json",
};

const CHECKS = [
  ["route:mounted", "routes", /path="photo-comparison\/:sessionUuid" element=\{<SessionDetailPage \/>\}/],
  ["page:company-query", "page", /fetchSession\(sessionUuid, operatingCompanyId\)/],
  ["page:error-before-render", "page", /if \(query\.isError\)[\s\S]{0,300}Couldn't load photo comparison session/],
  ["page:retry", "page", /onRetry=\{\(\) => void query\.refetch\(\)\}/],
  ["page:honest-status", "page", /query\.isLoading \? "loading" : \(session\?\.diff_status \?\? "not found"\)/],
  ["required:leaf", "required", /"id": "photo_comparison\.detail"[\s\S]{0,220}"route_hint": "\/safety\/photo-comparison\/:sessionUuid"[\s\S]{0,220}"connectivity"/],
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
  console.log(`verify-photo-comparison-detail-failure-truth --selftest ${CHECKS.length}/${CHECKS.length}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = collectProblems(readSources());
  if (problems.length) {
    console.error(`verify-photo-comparison-detail-failure-truth FAILED:\n${problems.map((problem) => ` - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-photo-comparison-detail-failure-truth PASS — detail read failures are retryable and never painted as perpetual loading");
}
