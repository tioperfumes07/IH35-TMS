#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link"],"leaves":["work_orders.list","parts_inventory.record_purchase"],"task":"MAINT-F7014-HOME-READ-RECOVERY","vertical":"class-sweep"} */
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");
const PREDICTIVE = "apps/frontend/src/pages/maintenance/PredictiveAlertsPage.tsx";

function audit(candidate) {
  const failures = [];
  if (!/recentQuery\.isError \? \([\s\S]{0,220}title="Couldn't load recent maintenance activity"[\s\S]{0,220}recentQuery\.refetch\(\)[\s\S]{0,120}: \(\s*<RecentActivityRow/.test(candidate)) failures.push("recent/completed histories fail closed with exact recovery");
  if (!/partsReorderQuery\.isError \? \([\s\S]{0,220}title="Couldn't load parts reorder flags"[\s\S]{0,220}partsReorderQuery\.refetch\(\)[\s\S]{0,120}: \(\s*<ParityTable/.test(candidate)) failures.push("parts reorder flags fail closed with exact recovery");
  if (!/recentTotalCount=\{recentQuery\.data\?\.recent_total_count/.test(candidate) || !/completedTotalCount=\{recentQuery\.data\?\.completed_total_count/.test(candidate)) failures.push("successful histories retain exact totals");
  if (candidate.includes("text-[11px]")) failures.push("leftover text-[11px]");
  if (candidate.includes("#8A92AB") || candidate.includes("#334155")) failures.push("leftover off-scale muted");
  return failures;
}

/** BANK-F91425 leftover refuse — PredictiveAlertsPage (At Risk on Home) text token ratchet. */
export function checkPredictiveAlertsLeftovers(src) {
  const failures = [];
  if (src.includes("text-[11px]")) failures.push("PredictiveAlertsPage leftover text-[11px] — use text-xs");
  if (src.includes("#8A92AB")) failures.push("PredictiveAlertsPage leftover #8A92AB — use #4B5563");
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
    `${source}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`,
  ];
  for (const needle of mutations) {
    const changed = needle.startsWith(source) ? needle : source.replace(needle, "/* planted defect */");
    if ((changed === source && !needle.startsWith(source)) || audit(changed).length === 0) throw new Error(`planted defect escaped: ${needle.slice(0, 80)}`);
  }
  // BANK-F91425 leftover plant — PredictiveAlertsPage page-scoped text token ratchet
  const livePred = fs.readFileSync(PREDICTIVE, "utf8");
  if (checkPredictiveAlertsLeftovers(livePred).length) {
    console.error("verify-maintenance-home-read-recovery --selftest FAIL: live PredictiveAlertsPage already failing leftover refuse");
    process.exit(1);
  }
  const leftoverPlant = livePred + '\n<p className="text-[11px] text-[#8A92AB]">plant</p>\n';
  if (!checkPredictiveAlertsLeftovers(leftoverPlant).some((f) => f.includes("leftover"))) {
    console.error("verify-maintenance-home-read-recovery --selftest FAIL: leftover text-[11px]/#8A92AB plant escaped");
    process.exit(1);
  }
  console.log(`verify-maintenance-home-read-recovery SELFTEST PASS — ${mutations.length}/${mutations.length} mutations + leftover plant`);
  process.exit(0);
}

const failures = audit(source);
const predSrc = fs.readFileSync(PREDICTIVE, "utf8");
failures.push(...checkPredictiveAlertsLeftovers(predSrc));
if (failures.length) {
  console.error(`verify-maintenance-home-read-recovery FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-maintenance-home-read-recovery PASS — recent WO histories and parts reorder flags recover exactly without stale rows");
