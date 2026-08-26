#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing action generation"],
    [/acknowledgeIntegrityAlert\(input\.alertId, input\.companyId/, "ack uses mutable identity"],
    [/resolveIntegrityAlert\(input\.alertId, input\.companyId/, "resolve uses mutable identity"],
    [/snoozeIntegrityAlert\(input\.alertId, input\.companyId, 24\)/, "snooze uses mutable identity"],
    [/input\.generation !== actionGenerationRef\.current/g, "stale successes are not rejected"],
    [/actionGenerationRef\.current \+= 1[\s\S]*resetAckMutation\(\)[\s\S]*resetResolveMutation\(\)[\s\S]*resetSnoozeMutation\(\)/, "drawer reset does not cancel stale actions"],
    [/ackMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale ack error can leak"],
    [/resolveMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale resolve error can leak"],
    [/snoozeMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale snooze error can leak"],
    [/kind="driver"[\s\S]*alert\.subject_driver_id/, "driver reverse drill is missing"],
    [/kind="unit"[\s\S]*alert\.subject_unit_id/, "unit reverse drill is missing"],
    [/kind="vendor"[\s\S]*alert\.subject_vendor_id/, "vendor reverse drill is missing"],
    [/loadIds\.map[\s\S]*kind="load"/, "load reverse drills are missing"],
    [/workOrderIds\.map[\s\S]*kind="work_order"/, "work-order reverse drills are missing"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 3)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "actionGenerationRef = useRef(0)",
    "acknowledgeIntegrityAlert(input.alertId, input.companyId",
    "resolveIntegrityAlert(input.alertId, input.companyId",
    "snoozeIntegrityAlert(input.alertId, input.companyId, 24)",
    "actionGenerationRef.current += 1",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-integrity-alert-detail-action-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-integrity-alert-detail-action-company-lifecycle PASS — actions are company/alert stable with linked subjects");
}
