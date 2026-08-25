#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/components/dispatch/LoadDetailGeofenceTimelineTab.tsx";
const LABEL = "verify-load-drawer-geofence-read-recovery";

export function audit(src) {
  const problems = [];
  if (!/if \(query\.error\)/.test(src)) problems.push("missing exact timeline error branch");
  if (!/data-geofence-timeline-read-error/.test(src) || !/role=["']alert["']/.test(src)) {
    problems.push("timeline failure is not exposed as an accessible state");
  }
  if (!/Retry timeline/.test(src)) problems.push("timeline failure has no named retry control");
  if (!/onClick=\{\(\) => void query\.refetch\(\)\}/.test(src)) problems.push("retry does not refetch the exact timeline query");
  if (!/if \(query\.isLoading\)[\s\S]{0,500}if \(query\.error\)/.test(src)) {
    problems.push("loading and error states are no longer ordered before empty/data states");
  }
  return problems;
}

function selftest() {
  const good = `
    if (query.isLoading) return <div>Loading</div>;
    if (query.error) return <div role="alert" data-geofence-timeline-read-error><button onClick={() => void query.refetch()}>Retry timeline</button></div>;
  `;
  const mutations = [
    ["error branch", good.replace("query.error", "query.data")],
    ["accessible state", good.replace('role="alert"', 'role="status"')],
    ["retry label", good.replace("Retry timeline", "Try later")],
    ["exact refetch", good.replace("query.refetch()", "window.location.reload()")],
    ["state order", good.replace("if (query.isLoading)", "if (query.error)")],
  ];
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  for (const [name, fixture] of mutations) if (!audit(fixture).length) failures.push(`${name} mutation escaped`);
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — ${mutations.length} mutations detected`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${LABEL}: ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — geofence timeline failures expose an accessible exact-query retry`);
}
