#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["maintenance.modal.work_order_detail"],"task":"MAINT-F7011-WO-OOS-ESTIMATE-READ-HONESTY","vertical":"class-sweep"} */
import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const source = fs.readFileSync(path, "utf8");

function audit(candidate) {
  const failures = [];
  if (!/if \(!wo \|\| !id \|\| severeEstimatesQ\.isError\) return null;/.test(candidate)) failures.push("failed estimate read suppresses cached calculation");
  if (!/\[wo, id, severeEstimatesQ\.data, severeEstimatesQ\.isError\]/.test(candidate)) failures.push("calculation reacts to error transition");
  if (!/isOosSevere && severeEstimatesQ\.isError \? \([\s\S]{0,220}data-testid="wo-oos-estimate-error"/.test(candidate)) failures.push("OOS detail exposes failed-read boundary");
  if (!/title="Couldn't load OOS downtime estimate"[\s\S]{0,220}severeEstimatesQ\.refetch\(\)/.test(candidate)) failures.push("OOS failure has exact retry");
  if (!/daysOos \* OOS_DAILY_LOSS_CENTS/.test(candidate) || !/downtimeCents \+ repairCents/.test(candidate)) failures.push("canonical cost formula preserved");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    " || severeEstimatesQ.isError",
    ", severeEstimatesQ.isError]",
    'data-testid="wo-oos-estimate-error"',
    "severeEstimatesQ.refetch()",
    "daysOos * OOS_DAILY_LOSS_CENTS",
    "downtimeCents + repairCents",
  ];
  for (const needle of mutations) {
    const changed = source.replace(needle, "/* planted defect */");
    if (changed === source || audit(changed).length === 0) throw new Error(`planted defect escaped: ${needle}`);
  }
  console.log(`verify-maint-wo-oos-estimate-read-honesty SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-maint-wo-oos-estimate-read-honesty FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-maint-wo-oos-estimate-read-honesty PASS — failed OOS estimate reads cannot masquerade as zero cost");
