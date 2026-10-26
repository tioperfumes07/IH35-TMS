#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const source = fs.readFileSync(file, "utf8");
// EVERY consumer of the counts must suppress a cached value on a failed read: the profile passes them to
// MaintenanceSnapshotSection AND UnitFaultsReverseSection (second consumer: row-6 photos layout, e882b97537).
function everyPropExact(src, prop, value) {
  const at = [...src.matchAll(new RegExp(`\\b${prop}=\\{`, "g"))].map((m) => m.index);
  return at.length > 0 && at.every((i) => src.startsWith(`${prop}=${value}`, i));
}
function verify(text) {
  const failures = [];
  if (!everyPropExact(text, "activeFaultCount", "{faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.total_count ?? 0}")) failures.push("failed fault read must suppress cached active count (every consumer)");
  if (!everyPropExact(text, "pendingFaultDraftCount", "{faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.auto_wo_count ?? 0}")) failures.push("failed fault read must suppress cached auto-WO count (every consumer)");
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
