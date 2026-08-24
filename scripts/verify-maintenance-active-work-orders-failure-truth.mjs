#!/usr/bin/env node
// @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["wo.console.list"],"task":"MAINTENANCE-ACTIVE-WORK-ORDERS-FAILURE-TRUTH"}
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const CHECKS = [
  ["query:company-scoped", /listWorkOrdersFiltered\(companyId,/],
  ["leaf:mounted", /tab === "active_wos"[\s\S]{0,200}maintenance-active-wos-tab/],
  ["error:before-table", /workOrdersQuery\.isError \? \([\s\S]{0,500}<WorkOrdersTable/],
  ["error:visible", /title="Couldn't load active work orders"/],
  ["error:exact-retry", /onRetry=\{\(\) => void workOrdersQuery\.refetch\(\)\}/],
  ["success:canonical-rows", /<WorkOrdersTable[\s\S]{0,180}rows=\{workOrdersQuery\.data\?\.work_orders \?\? \[\]\}/],
];

function problems(source) {
  return CHECKS.filter(([, pattern]) => !pattern.test(source)).map(([id]) => id);
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const missed = [];
  for (const [id, pattern] of CHECKS) {
    const mutated = source.replace(pattern, "__PLANTED_DEFECT__");
    if (!problems(mutated).includes(id)) missed.push(id);
  }
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-maintenance-active-work-orders-failure-truth --selftest ${CHECKS.length}/${CHECKS.length}`);
} else {
  const found = problems(source);
  if (found.length) {
    console.error(`verify-maintenance-active-work-orders-failure-truth FAILED:\n${found.map((id) => ` - ${id}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-maintenance-active-work-orders-failure-truth PASS — failed scoped reads render retryable error before the active-WO table");
}
