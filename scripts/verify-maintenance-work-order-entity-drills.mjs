#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["work_order"],"leafRe":"^maintenance\\.(modal\\.(convert_issue_to_wo|triage)|panel\\.road_service_active)$","task":"MAINT-WO-ENTITY-DRILLS","vertical":"column-wave"} */
/** @matrix-built {"modules":["drivers"],"cols":["work_order"],"leafRe":"^profiles\\.detail$","task":"MAINT-WO-ENTITY-DRILLS","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["work_order"],"leafRe":"^unit\\.profile\\.maintenance$","task":"MAINT-WO-ENTITY-DRILLS","vertical":"column-wave"} */

import fs from "node:fs";

const sources = {
  convert: fs.readFileSync("apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx", "utf8"),
  triage: fs.readFileSync("apps/frontend/src/pages/maintenance/components/TriageModal.tsx", "utf8"),
  roadside: fs.readFileSync("apps/frontend/src/pages/maintenance/components/RoadServiceActivePanel.tsx", "utf8"),
  driver: fs.readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8"),
  detail: fs.readFileSync("apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", "utf8"),
};

const checks = [
  ["convert", /convertIssueToWo\(String\(card!\.load_id\), operatingCompanyId/, "WO conversion write is company-scoped"],
  ["convert", /kind="unit" id=\{card\.unit_id\}/, "WO conversion unit drills"],
  ["convert", /kind="driver" id=\{card\.driver_id\}/, "WO conversion driver drills"],
  ["convert", /kind="load" id=\{card\.load_id\}/, "WO conversion load drills"],
  ["triage", /kind="unit" id=\{issue\.unit_id\}/, "triage unit drills"],
  ["triage", /kind="driver" id=\{issue\.driver_id\}/, "triage driver drills"],
  ["roadside", /kind="unit"[\s\S]*id=\{wo\.unit_id\}/, "roadside unit drills"],
  ["roadside", /onClick=\{\(\) => onOpen\(wo\.id\)\}/, "roadside work order opens"],
  ["driver", /DriverWorkOrdersReverseSection[\s\S]*driver-detail-work-orders-reverse/, "driver profile mounts WO reverse list"],
  ["detail", /kind="work_order"[\s\S]*id=\{String\(workOrder\.id \?\? ""\)\}/, "WO detail self-drills canonically"],
  ["detail", /kind="unit"[\s\S]*workOrder\.unit_id/, "WO detail drills to unit"],
  ["detail", /kind="driver"[\s\S]*workOrder\.driver_id/, "WO detail drills to driver"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-maintenance-work-order-entity-drills: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(new RegExp(pattern.source, `${pattern.flags}g`), "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-work-order-entity-drills: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-work-order-entity-drills: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-maintenance-work-order-entity-drills: PASS — ${checks.length} WO/entity drill invariants`);
