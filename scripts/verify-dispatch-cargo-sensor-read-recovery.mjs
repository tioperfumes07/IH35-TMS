#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TIMELINE = "apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx";
const BADGE = "apps/frontend/src/components/dispatch/CargoTempBadge.tsx";
const LABEL = "verify-dispatch-cargo-sensor-read-recovery";

export function audit(sources) {
  const timeline = sources?.timeline ?? readFileSync(join(ROOT, TIMELINE), "utf8");
  const badge = sources?.badge ?? readFileSync(join(ROOT, BADGE), "utf8");
  const problems = [];
  if (!/if \(query\.isError\)[\s\S]{0,500}data-cargo-sensor-timeline-error/.test(timeline)) problems.push("timeline failure is not distinct and visible");
  if (!/role=["']alert["']/.test(timeline) || !/Retry cargo sensors/.test(timeline)) problems.push("timeline failure lacks accessible named retry");
  if (!/onClick=\{\(\) => void query\.refetch\(\)\}/.test(timeline)) problems.push("timeline retry does not refetch the exact query");
  if (/query\.isError \|\| !query\.data/.test(timeline)) problems.push("timeline failure remains conflated with no response");
  if (!/if \(timeline\.isError\)[\s\S]{0,700}data-cargo-temp-retry/.test(badge)) problems.push("board badge failure is not a retry control");
  if (!/Retry temp/.test(badge) || !/timeline\.refetch\(\)/.test(badge)) problems.push("board badge cannot refetch its exact query");
  if (!/event\.stopPropagation\(\)/.test(badge)) problems.push("board retry can trigger the parent row action");
  if (/timeline\.isError \|\| !timeline\.data/.test(badge)) problems.push("board failure still lies as healthy no-sensor state");
  if (!/if \(!timeline\.data\)[\s\S]{0,250}No sensor/.test(badge)) problems.push("healthy absent-data badge was not preserved");
  return problems;
}

function selftest() {
  const good = {
    timeline: `if (query.isError) return <div role="alert" data-cargo-sensor-timeline-error><button onClick={() => void query.refetch()}>Retry cargo sensors</button></div>; if (!query.data) return <div>No response</div>;`,
    badge: `if (timeline.isError) return <button data-cargo-temp-retry={loadId} onClick={(event) => { event.stopPropagation(); void timeline.refetch(); }}>Retry temp</button>; if (!timeline.data) return <span>No sensor</span>;`,
  };
  const mutations = [
    ["timeline state", { ...good, timeline: good.timeline.replace("query.isError", "query.isSuccess") }],
    ["timeline alert", { ...good, timeline: good.timeline.replace('role="alert"', 'role="status"') }],
    ["timeline retry", { ...good, timeline: good.timeline.replace("query.refetch()", "window.location.reload()") }],
    ["badge state", { ...good, badge: good.badge.replace("timeline.isError", "timeline.isSuccess") }],
    ["badge retry", { ...good, badge: good.badge.replace("timeline.refetch()", "window.location.reload()") }],
    ["row safety", { ...good, badge: good.badge.replace("event.stopPropagation();", "") }],
    ["healthy absence", { ...good, badge: good.badge.replace("No sensor", "Unavailable") }],
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
  const problems = audit();
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${LABEL}: ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — cargo timeline and board badges expose exact-query recovery`);
}
