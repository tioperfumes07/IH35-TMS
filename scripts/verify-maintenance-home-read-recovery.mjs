#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link"],"leaves":["work_orders.list","parts_inventory.record_purchase"],"task":"MAINT-F7014-HOME-READ-RECOVERY","vertical":"class-sweep"} */
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");

function audit(candidate) {
  const failures = [];
  if (!/recentQuery\.isError \? \([\s\S]{0,220}title="Couldn't load recent maintenance activity"[\s\S]{0,220}recentQuery\.refetch\(\)[\s\S]{0,120}: \(\s*<RecentActivityRow/.test(candidate)) failures.push("recent/completed histories fail closed with exact recovery");
  if (!/partsReorderQuery\.isError \? \([\s\S]{0,220}title="Couldn't load parts reorder flags"[\s\S]{0,220}partsReorderQuery\.refetch\(\)[\s\S]{0,120}: \(\s*<ParityTable/.test(candidate)) failures.push("parts reorder flags fail closed with exact recovery");
  if (!/recentTotalCount=\{recentQuery\.data\?\.recent_total_count/.test(candidate) || !/completedTotalCount=\{recentQuery\.data\?\.completed_total_count/.test(candidate)) failures.push("successful histories retain exact totals");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "recentQuery.isError ? (",
    "recentQuery.refetch()",
    "partsReorderQuery.isError ? (",
    "partsReorderQuery.refetch()",
    "recentTotalCount={recentQuery.data?.recent_total_count",
    "completedTotalCount={recentQuery.data?.completed_total_count",
  ];
  for (const needle of mutations) {
    const changed = source.replace(needle, "/* planted defect */");
    if (changed === source || audit(changed).length === 0) throw new Error(`planted defect escaped: ${needle}`);
  }
  console.log(`verify-maintenance-home-read-recovery SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-maintenance-home-read-recovery FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-maintenance-home-read-recovery PASS — recent WO histories and parts reorder flags recover exactly without stale rows");
