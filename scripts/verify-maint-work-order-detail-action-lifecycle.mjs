#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["work_order","connectivity","qbo_chrome"],"leaves":["wo.console.list"],"task":"MAINT-F6630-WO-DETAIL-ACTION-LIFECYCLE","vertical":"column-wave"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/type WorkOrderActionScope = \{[\s\S]*workOrderId: string;[\s\S]*companyId: string;[\s\S]*generation: number;/, "immutable action scope exists"],
  [/const actionGenerationRef = useRef\(0\)/, "action generation exists"],
  [/cancelWorkOrderConsole\(input\.workOrderId, input\.companyId, input\.body\)/, "cancel submits captured work order and company"],
  [/voidWorkOrderConsole\(input\.workOrderId, input\.companyId, input\.reason\)/, "void submits captured work order and company"],
  [/onSuccess: \(_result, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*Work order cancelled[\s\S]*invalidateWoScope\(input\)/, "cancel suppresses stale success and refreshes captured scope"],
  [/onSuccess: \(_result, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*Work order voided[\s\S]*invalidateWoScope\(input\)/, "void suppresses stale success and refreshes captured scope"],
  [/onError: \(error: unknown, input\) => \{\s*if \(input\.generation === actionGenerationRef\.current\) pushToast\(userFacingApiError\(error, "Cancel failed"\)/, "cancel suppresses stale error"],
  [/onError: \(error: unknown, input\) => \{\s*if \(input\.generation === actionGenerationRef\.current\) pushToast\(userFacingApiError\(error, "Void failed"\)/, "void suppresses stale error"],
  [/useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;\s*createWoReasonMut\.reset\(\);\s*cancelMut\.reset\(\);\s*voidMut\.reset\(\);[\s\S]*\}, \[companyId, id\]\)/, "work order or company transition retires actions and clears modal state"],
  [/cancelMut\.mutateAsync\(\{\s*workOrderId: String\(id\),\s*companyId,\s*generation: actionGenerationRef\.current,\s*body:/, "cancel intent snapshots work order company and generation"],
  [/voidMut\.mutateAsync\(\{\s*workOrderId: String\(id\),\s*companyId,\s*generation: actionGenerationRef\.current,\s*reason:/, "void intent snapshots work order company and generation"],
  [/createWoReasonMut\.mutate\(\{\s*workOrderId: String\(id\),\s*companyId,\s*generation: actionGenerationRef\.current,\s*label,/, "reason create snapshots modal scope"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maint-work-order-detail-action-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maint-work-order-detail-action-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-work-order-detail-action-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}

console.log(`verify-maint-work-order-detail-action-lifecycle PASS — ${checks.length} immutable work-order action invariants`);
