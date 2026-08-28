#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","connectivity"],"leaves":["planning.timeline"],"task":"DSP-F7090-TIMELINE-LEAVE-FAILURE-HONESTY","vertical":"class-sweep"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx";
const read = () => fs.readFileSync(FILE, "utf8");

export function audit(source = read()) {
  const failures = [];
  for (const token of [
    'if (leaveQuery.isError) return "Unknown";',
    "{leaveQuery.isError ? (",
    'userFacingApiError(leaveQuery.error, "Could not load driver leave and availability")',
    "onRetry={() => void leaveQuery.refetch()}",
  ]) if (!source.includes(token)) failures.push(`timeline leave failure honesty missing ${token}`);
  if (!/StatusPill[\s\S]{0,120}"Unknown"/.test(source)) failures.push("StatusPill must accept the honest Unknown state");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const source = read();
  const mutations = [
    source.replace('if (leaveQuery.isError) return "Unknown";', ""),
    source.replace("{leaveQuery.isError ? (", "{false ? ("),
    source.replace("onRetry={() => void leaveQuery.refetch()}", "onRetry={() => undefined}"),
  ];
  for (const [index, mutant] of mutations.entries()) {
    if (mutant === source) throw new Error(`mutation ${index + 1} was inert`);
    if (audit(mutant).length === 0) throw new Error(`mutation ${index + 1} survived`);
  }
  console.log(`verify-dispatch-timeline-leave-failure-honesty SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`verify-dispatch-timeline-leave-failure-honesty FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-dispatch-timeline-leave-failure-honesty PASS — failed leave overlay is visible/retryable and never invents Available status");
