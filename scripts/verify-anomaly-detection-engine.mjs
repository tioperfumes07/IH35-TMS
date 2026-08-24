#!/usr/bin/env node
// @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["anomaly_alerts.list"],"task":"SAFETY-CRITICAL-ANOMALY-FAILURE-TRUTH"}
import fs from "node:fs";

const FILES = {
  migration: "db/migrations/202606080211_anomaly_alert_rules.sql",
  rules: "apps/backend/src/safety/anomaly/seed-default-rules.ts",
  worker: "apps/backend/src/jobs/anomaly-detector-worker.ts",
  routes: "apps/backend/src/safety/anomaly/routes.ts",
  index: "apps/backend/src/index.ts",
  dashboard: "apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx",
  badge: "apps/frontend/src/components/safety/AnomalyAlertBadge.tsx",
  block: ".block-ready/GAP-46.json",
  required: "docs/specs/scoreboard/modules/safety.required.json",
};

const CHECKS = [
  ["migration:tables", "migration", /anomaly_alert_rules/],
  ["rules:defaults", "rules", /DEFAULT_ANOMALY_RULES/],
  ["worker:mounted", "worker", /initializeAnomalyDetectorWorker/],
  ["routes:mounted", "routes", /registerAnomalyDetectionRoutes/],
  ["index:wiring", "index", /registerAnomalyDetectionRoutes|initializeAnomalyDetectorWorker/],
  ["dashboard:mounted", "dashboard", /anomaly-dashboard/],
  ["badge:component", "badge", /AnomalyAlertBadge/],
  ["badge:error-branch", "badge", /if \(q\.isError\)/],
  ["badge:visible-failure", "badge", /Critical anomaly alerts couldn't be loaded\. Retry\./],
  ["badge:retry", "badge", /onClick=\{\(\) => void q\.refetch\(\)\}/],
  ["badge:error-before-zero", "badge", /if \(q\.isError\)[\s\S]+const count = q\.data \?\? 0/],
  ["required:exact-leaf", "required", /"id": "anomaly_alerts\.list"[\s\S]{0,180}"route_hint": "\/safety\/anomaly-alerts"[\s\S]{0,100}"connectivity"/],
];

export function collectProblems(sources) {
  const failures = CHECKS.filter(([, key, pattern]) => !pattern.test(sources[key] ?? "")).map(([id]) => id);
  if ((sources.rules?.match(/rule_slug/g)?.length ?? 0) < 6) failures.push("rules:need-six");
  if (!sources.block) failures.push("block:missing");
  return failures;
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""]));
}

function selftest() {
  const baseline = readSources();
  const missed = [];
  for (const [id, key, pattern] of CHECKS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const mutated = { ...baseline, [key]: baseline[key].replace(new RegExp(pattern.source, flags), "__PLANTED_DEFECT__") };
    if (!collectProblems(mutated).includes(id)) missed.push(id);
  }
  if (!collectProblems({ ...baseline, rules: "rule_slug rule_slug" }).includes("rules:need-six")) missed.push("rules:need-six");
  if (!collectProblems({ ...baseline, block: "" }).includes("block:missing")) missed.push("block:missing");
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-anomaly-detection-engine --selftest ${CHECKS.length + 2}/${CHECKS.length + 2}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = collectProblems(readSources());
  if (failures.length) {
    console.error(`verify-anomaly-detection-engine FAILED:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify:anomaly-detection-engine — OK; critical-alert read failures are visible and retryable");
}
