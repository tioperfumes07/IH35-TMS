#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx";
const LABEL = "verify-home-fleet-restore-read-recovery";

export function audit(src) {
  const problems = [];
  if (!/if \(query\.isError\)/.test(src)) problems.push("missing exact restore-cost error branch");
  if (/if \(query\.isError \|\| !data\) return null/.test(src)) problems.push("read failures still disappear as empty");
  if (!/data-fleet-restore-read-error/.test(src) || !/role=["']alert["']/.test(src)) {
    problems.push("restore-cost failure is not an accessible visible state");
  }
  if (!/Retry restore cost/.test(src)) problems.push("restore-cost failure has no named retry");
  if (!/onClick=\{\(\) => void query\.refetch\(\)\}/.test(src)) problems.push("retry does not refetch the exact restore-cost query");
  if (!/total_remaining_cents/.test(src) || !/total_estimated_cents/.test(src) || !/total_actual_cents/.test(src)) {
    problems.push("estimated/actual/remaining economics were dropped");
  }
  if (!/unit_count === 0 && data\.total_estimated_cents === 0/.test(src)) problems.push("honest zero-row suppression was dropped");
  return problems;
}

function selftest() {
  const good = `
    if (query.isError) return <section role="alert" data-fleet-restore-read-error><button onClick={() => void query.refetch()}>Retry restore cost</button></section>;
    if (!data) return null;
    if (data.unit_count === 0 && data.total_estimated_cents === 0) return null;
    return <p>{data.total_remaining_cents}{data.total_estimated_cents}{data.total_actual_cents}</p>;
  `;
  const mutations = [
    ["error branch", good.replace("query.isError", "query.isSuccess")],
    ["visible alert", good.replace('role="alert"', 'role="status"')],
    ["retry label", good.replace("Retry restore cost", "Try later")],
    ["exact refetch", good.replace("query.refetch()", "window.location.reload()")],
    ["actual economics", good.replace("data.total_actual_cents", "0")],
    ["zero suppression", good.replace("data.unit_count === 0", "false")],
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
  console.log(`${LABEL}: PASS — Home fleet-restore failure is visible and recoverable without changing economics`);
}
