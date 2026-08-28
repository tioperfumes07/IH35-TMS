#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["work_order","unit","connectivity","reverse_link"],"leaves":["maintenance.panel.pm_alerts","unit.profile.maintenance"],"task":"MAINT-F6604-PM-ALERT-COMPANY-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx";
const source = fs.readFileSync(path, "utf8");

const checks = [
  [/const actionGenerationRef = useRef\(0\)/, "shared action generation exists"],
  [/mutationFn: \(input: \{ alertId: string; companyId: string; generation: number \}\) =>\s*acknowledgeMaintenancePmAlert\(input\.alertId, input\.companyId\)/, "ack snapshots alert and company"],
  [/mutationFn: \(input: \{ alertId: string; workOrderId: string; companyId: string; generation: number \}\) =>\s*scheduleMaintenancePmAlert\(input\.alertId, input\.companyId, input\.workOrderId\)/, "schedule snapshots alert, WO, and company"],
  [/(?:onSuccess: \(_result, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*?){2}/, "both success callbacks reject stale generations"],
  [/(?:onError: \(_error, input\) => \{\s*if \(input\.generation === actionGenerationRef\.current\) pushToast\([\s\S]*?){2}/, "both error callbacks reject stale generations"],
  [/(?:invalidateQueries\(\{ queryKey: \["maintenance", "pm-alerts", input\.companyId\] \}\)[\s\S]*?){2}/, "both success callbacks refresh the submitted company"],
  [/useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;\s*ackMutation\.reset\(\);\s*scheduleMutation\.reset\(\);\s*setSchedulingAlertId\(null\);\s*setSelectedWorkOrderId\(null\);\s*setOpenPage\(1\);\s*setScheduledPage\(1\);\s*\}, \[operatingCompanyId, pageSize\]\)/, "company or range switch retires requests, clears action state, and resets both pagers"],
  [/ackMutation\.mutateAsync\(\{\s*alertId: alert\.id,\s*companyId: operatingCompanyId,\s*generation: actionGenerationRef\.current,\s*\}\)/, "ack helper submits immutable scope"],
  [/scheduleMutation\.mutate\(\{\s*alertId: alert\.id,\s*workOrderId: selectedWorkOrderId,\s*companyId: operatingCompanyId,\s*generation: actionGenerationRef\.current,\s*\}\)/, "schedule helper submits immutable scope"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maintenance-pm-alert-company-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-pm-alert-company-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-pm-alert-company-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}

console.log(`verify-maintenance-pm-alert-company-lifecycle PASS — ${checks.length} immutable-scope lifecycle invariants`);
