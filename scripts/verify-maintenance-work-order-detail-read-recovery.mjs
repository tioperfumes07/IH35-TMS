#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link","work_order"],"leaves":["maintenance.modal.work_order_detail"],"task":"MAINT-F7015-WORK-ORDER-DETAIL-READ-RECOVERY","vertical":"class-sweep"} */

import fs from "node:fs";

const home = fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8");
const modal = fs.readFileSync("apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", "utf8");

const checks = [
  [home, /const loadedWorkOrderId = workOrderDetailQuery\.isError\s*\? null\s*:\s*String\(workOrderDetailQuery\.data\?\.id \?\? ""\)\.trim\(\) \|\| null;/, "loaded identity is unavailable after detail read failure"],
  [home, /workOrder=\{\(workOrderDetailQuery\.isError \? null : workOrderDetailQuery\.data \?\? null\)/, "retained detail payload is suppressed on read error"],
  [home, /readError=\{workOrderDetailQuery\.isError \? "Work order details could not be loaded\. Retry before taking action\." : null\}/, "detail failure is visible"],
  [home, /onRetry=\{\(\) => void workOrderDetailQuery\.refetch\(\)\}/, "detail failure has exact retry"],
  [home, /selectedWorkOrderId &&\s*loadedWorkOrderId === selectedWorkOrderId &&\s*!workOrderDetailQuery\.isError &&\s*!workOrderDetailQuery\.isFetching &&\s*!statusMutation\.isPending/, "complete action requires matching loaded identity and healthy reads"],
  [home, /id: loadedWorkOrderId,\s*status: "complete",\s*companyId,\s*generation: statusGenerationRef\.current,/, "complete submits the loaded work order identity"],
  [home, /useEffect\(\(\) => \{\s*statusGenerationRef\.current \+= 1;\s*statusMutation\.reset\(\);\s*\}, \[selectedWorkOrderId\]\);/, "selection transition retires prior complete action"],
  [home, /onError: \(_error, args\) => \{\s*if \(args\.generation === statusGenerationRef\.current\) \{\s*pushToast\("Failed to update R&M status", "error"\);/, "stale complete errors are suppressed"],
  [modal, /if \(!workOrder\) \{[\s\S]*<ListErrorBanner message=\{readError\} onRetry=\{onRetry\} \/>[\s\S]*Loading work order details…/, "drawer remains mounted with retryable error or loading state"],
  [modal, /const canMarkComplete = Boolean\(onComplete\) && hasCompletionPrerequisite;/, "detail drawer disables complete without a bound action"],
];

const failures = (sources) => checks.filter(([source, pattern]) => !pattern.test(sources.get(source))).map(([, , label]) => label);
const originals = new Map([[home, home], [modal, modal]]);
const missing = failures(originals);
if (missing.length) {
  console.error(`verify-maintenance-work-order-detail-read-recovery FAIL — ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [source, pattern, label] of checks) {
    const mutant = new Map(originals);
    mutant.set(source, source.replace(pattern, "/* planted defect */"));
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-work-order-detail-read-recovery SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-work-order-detail-read-recovery SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}

console.log(`verify-maintenance-work-order-detail-read-recovery PASS — ${checks.length} detail read/action invariants`);
