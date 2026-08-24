#!/usr/bin/env node
// @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["maintenance.panel.integrations"],"task":"MAINTENANCE-INTEGRATION-STRIP-FAILURE-TRUTH"}
import fs from "node:fs";

const FILES = {
  strip: "apps/frontend/src/pages/maintenance/components/IntegrationsStrip.tsx",
  required: "docs/specs/scoreboard/modules/maintenance.required.json",
};

const CHECKS = [
  ["samsara:error-branch", "strip", /samsaraQuery\.isError[\s\S]{0,260}Samsara health couldn't be loaded\. Retry\./],
  ["samsara:retry", "strip", /onClick=\{\(\) => void samsaraQuery\.refetch\(\)\}/],
  ["samsara:unavailable", "strip", /Samsara: unavailable/],
  ["relay:error-branch", "strip", /relayQuery\.isError[\s\S]{0,260}Relay health couldn't be loaded\. Retry\./],
  ["relay:retry", "strip", /onClick=\{\(\) => void relayQuery\.refetch\(\)\}/],
  ["relay:unavailable", "strip", /Relay: unavailable/],
  ["qbo:usmca-hidden", "strip", /const qboCapable = selectedCompany\?\.code\?\.trim\(\)\.toUpperCase\(\) === "TRANSP"/],
  ["qbo:query-gated", "strip", /enabled: Boolean\(companyId && qboCapable\)/],
  ["required:leaf", "required", /"id": "maintenance\.panel\.integrations"[\s\S]{0,260}"surface_path": "pages\/maintenance\/components\/IntegrationsStrip\.tsx"[\s\S]{0,100}"connectivity"/],
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
  console.log(`verify-maintenance-integration-strip-failure-truth --selftest ${CHECKS.length}/${CHECKS.length}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = collectProblems(readSources());
  if (problems.length) {
    console.error(`verify-maintenance-integration-strip-failure-truth FAILED:\n${problems.map((problem) => ` - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-maintenance-integration-strip-failure-truth PASS — Samsara/Relay failures are visible and retryable; USMCA QBO remains hidden");
}
