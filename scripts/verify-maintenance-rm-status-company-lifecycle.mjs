#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["work_order","connectivity","reverse_link"],"leaves":["rm_status_board.bucket","maintenance.modal.work_order_detail"],"task":"MAINT-F6605-RM-STATUS-COMPANY-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/const statusGenerationRef = useRef\(0\)/, "status generation exists"],
  [/mutationFn: \(args: \{ id: string; status: "in_progress" \| "waiting_parts" \| "complete"; companyId: string; generation: number \}\) =>\s*transitionWorkOrder\(args\.id, args\.companyId, \{ new_status: args\.status \}\)/, "transition snapshots company and generation"],
  [/onSuccess: async \(_result, args\) => \{\s*if \(args\.generation !== statusGenerationRef\.current\) return;/, "stale completion is rejected"],
  [/(?:queryKey: \["maintenance", (?:"dashboard", )?"[^"]+", args\.companyId\][\s\S]*?){3}/, "all refreshes use submitted company"],
  [/useEffect\(\(\) => \{\s*statusGenerationRef\.current \+= 1;\s*statusMutation\.reset\(\);\s*setSelectedWorkOrderId\(null\);\s*\}, \[companyId\]\)/, "company switch retires request and closes detail"],
  [/statusActionPending=\{statusMutation\.isPending\}[\s\S]*onAdvanceStatus=\{\(id, status\) => \{\s*if \(statusMutation\.isPending\) return;\s*statusMutation\.mutate\(\{\s*id,\s*status,\s*companyId,\s*generation: statusGenerationRef\.current,\s*\}\);/, "board submit is single-flight and snapshots scope"],
  [/id: loadedWorkOrderId,\s*status: "complete",\s*companyId,\s*generation: statusGenerationRef\.current,/, "detail completion submits loaded scope"],
  [/onError: \(_error, args\) => \{\s*if \(args\.generation === statusGenerationRef\.current\) \{\s*pushToast\("Failed to update R&M status", "error"\);/, "current failure stays visible and stale failure is suppressed"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maintenance-rm-status-company-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-rm-status-company-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-rm-status-company-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}
console.log(`verify-maintenance-rm-status-company-lifecycle PASS — ${checks.length} status lifecycle invariants`);
