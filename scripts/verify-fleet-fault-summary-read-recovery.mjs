#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const source = fs.readFileSync(file, "utf8");
function verify(text) {
  const failures = [];
  if (!/activeFaultCount=\{faultSummaryQuery\.isError \? 0 : faultSummaryQuery\.data\?\.total_count \?\? 0\}/.test(text)) failures.push("failed fault read must suppress cached active count");
  if (!/pendingFaultDraftCount=\{faultSummaryQuery\.isError \? 0 : faultSummaryQuery\.data\?\.auto_wo_count \?\? 0\}/.test(text)) failures.push("failed fault read must suppress cached auto-WO count");
  if (!/Couldn't load active fault summary/.test(text) || !/faultSummaryQuery\.refetch\(\)/.test(text)) failures.push("fault summary failure needs exact Retry");
  return failures;
}
const failures = verify(source);
if (failures.length) { failures.forEach((f) => console.error(`- ${f}`)); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [source.replace("faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.total_count", "faultSummaryQuery.data?.total_count"), source.replace("faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.auto_wo_count", "faultSummaryQuery.data?.auto_wo_count"), source.replace("onRetry={() => void faultSummaryQuery.refetch()}", "onRetry={() => undefined}")];
  mutations.forEach((m, i) => { if (verify(m).length === 0) { console.error(`selftest mutation ${i + 1} escaped`); process.exit(1); } });
  console.log("fleet fault summary read recovery selftest PASS (3/3)");
}
console.log("fleet fault summary read recovery PASS");
