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
  driverProfile: fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "utf8"),
  driverReverse: fs.readFileSync("apps/frontend/src/components/maintenance/DriverWorkOrdersReverseSection.tsx", "utf8"),
  detail: fs.readFileSync("apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", "utf8"),
  detailPage: fs.readFileSync("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", "utf8"),
  home: fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8"),
  createWo: fs.readFileSync("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", "utf8"),
  workOrders: fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8"),
  dispatchRoutes: fs.readFileSync("apps/backend/src/dispatch/arch-tabs.routes.ts", "utf8"),
  dispatchService: fs.readFileSync("apps/backend/src/dispatch/arch-tabs.service.ts", "utf8"),
  dispatchPage: fs.readFileSync("apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx", "utf8"),
  routes: fs.readFileSync("apps/backend/src/maintenance/triage.routes.ts", "utf8"),
};

const checks = [
  ["convert", /convertIssueToWo\(String\(card!\.load_id\), operatingCompanyId/, "WO conversion write is company-scoped"],
  ["convert", /kind="unit" id=\{card\.unit_id\}/, "WO conversion unit drills"],
  ["convert", /kind="driver" id=\{card\.driver_id\}/, "WO conversion driver drills"],
  ["convert", /kind="load" id=\{card\.load_id\}/, "WO conversion load drills"],
  ["triage", /kind="unit" id=\{issue\.unit_id\}/, "triage unit drills"],
  ["triage", /kind="driver" id=\{issue\.driver_id\}/, "triage driver drills"],
  ["roadside", /kind="unit"[\s\S]*id=\{wo\.unit_id\}/, "roadside unit drills"],
  ["roadside", /entityLabel\(wo\.unit_number, wo\.unit_id, "Unit"\)/, "roadside unit label cannot borrow work-order identity"],
  ["roadside", /onClick=\{\(\) => onOpen\(wo\.id\)\}/, "roadside work order opens"],
  ["driver", /DriverWorkOrdersReverseSection[\s\S]*driver-detail-work-orders-reverse/, "driver profile mounts WO reverse list"],
  ["driverProfile", /DriverWorkOrdersReverseSection[\s\S]{0,180}driver-profile-work-orders-reverse/, "mounted driver profile exposes WO reverse list"],
  ["driverReverse", /<EntityLinkOrTombstone[\s\S]{0,100}kind="work_order"[\s\S]{0,100}id=\{id \|\| null\}[\s\S]{0,100}name=\{wo\.display_id \?\? wo\.description\}/, "driver WO reverse uses an honest tombstone-aware work-order drill"],
  ["driverReverse", /<EntityLinkOrTombstone[\s\S]{0,100}kind="unit"[\s\S]{0,100}id=\{String\(wo\.unit_id\)\}[\s\S]{0,100}name=\{wo\.unit_number\}/, "driver WO reverse uses an honest tombstone-aware unit drill"],
  ["driverReverse", /<EntityLinkOrTombstone[\s\S]{0,100}kind="load"[\s\S]{0,100}id=\{String\(wo\.load_id\)\}[\s\S]{0,100}name=\{wo\.linked_load_number\}/, "driver WO reverse uses an honest tombstone-aware load drill"],
  ["detail", /kind="work_order"[\s\S]{0,100}id=\{(?:String\(workOrder\.id \?\? ""\)|asEntityId\(workOrder\.id\))\}/, "WO detail self-drills canonically"],
  ["detail", /kind="unit"[\s\S]*workOrder\.unit_id/, "WO detail drills to unit"],
  ["detail", /kind="driver"[\s\S]*workOrder\.driver_id/, "WO detail drills to driver"],
  ["detail", /kind="vendor"[\s\S]{0,120}id=\{asEntityId\(workOrder\.resolved_vendor_id\)\}[\s\S]{0,80}name=\{workOrder\.resolved_vendor_name\}/, "WO modal drills through canonical resolved vendor"],
  ["home", /source_type:\s*"IT"/, "triage creator preserves canonical IT source type"],
  ["home", /source_intransit_issue_id:\s*prefillFromIssue\.id/, "triage creator carries source issue id"],
  ["home", /load_id:\s*prefillFromIssue\.load_id\s*\?\?\s*""/, "triage creator carries source load"],
  ["home", /roadside_breakdown_load_id:\s*prefillFromIssue\.load_id\s*\?\?\s*""/, "triage creator carries source breakdown load"],
  ["createWo", /source_intransit_issue_id:\s*values\.source_intransit_issue_id\s*\|\|\s*undefined/, "source issue id reaches create payload"],
  ["workOrders", /source_intransit_issue_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, "backend accepts source issue id"],
  ["workOrders", /FROM dispatch\.intransit_issues[\s\S]*operating_company_id = \$2::uuid[\s\S]*promoted_to_wo_id IS NULL[\s\S]*promoted_to_damage_report_id IS NULL[\s\S]*FOR UPDATE/, "source issue is locked and company-scoped"],
  ["workOrders", /sourceIssue\.load_id !== body\.header\.load_id[\s\S]*sourceIssue\.load_id !== body\.header\.roadside_breakdown_load_id/, "source load must match both WO load columns"],
  ["workOrders", /UPDATE maintenance\.work_orders[\s\S]*SET source_intransit_issue_id = \$1::uuid[\s\S]*id = \$2::uuid[\s\S]*operating_company_id = \$3::uuid/, "WO reverse lineage is persisted company-scoped"],
  ["workOrders", /UPDATE dispatch\.intransit_issues[\s\S]*SET promoted_to_wo_id = \$1::uuid[\s\S]*id = \$2::uuid[\s\S]*operating_company_id = \$3::uuid[\s\S]*promoted_to_wo_id IS NULL/, "issue forward lineage is persisted company-scoped"],
  ["workOrders", /maintenance\.triage\.converted_to_wo[\s\S]*aggregate_type:\s*"dispatch\.intransit_issues"/, "conversion event is queued atomically"],
  ["workOrders", /LEFT JOIN mdata\.loads l ON l\.id = w\.load_id AND l\.operating_company_id = w\.operating_company_id/, "WO detail resolves canonical load label company-scoped"],
  ["workOrders", /LEFT JOIN dispatch\.intransit_issues si ON si\.id = w\.source_intransit_issue_id AND si\.operating_company_id = w\.operating_company_id/, "WO detail resolves source issue company-scoped"],
  ["detail", /Source In-Transit Issue[\s\S]*\/dispatch\/in-transit-issues\?issue_id=/, "WO modal renders exact source issue reverse route"],
  ["detailPage", /data-testid="wo-source-intransit-issue"[\s\S]*\/dispatch\/in-transit-issues\?issue_id=/, "WO page renders exact source issue reverse route"],
  ["dispatchRoutes", /issue_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)[\s\S]*issue_id:\s*query\.data\.issue_id/, "dispatch route accepts exact source issue filter"],
  ["dispatchService", /if \(filters\.issue_id\)[\s\S]*clauses\.push\(`i\.id = \$\$\{values\.length\}::uuid`\)/, "dispatch source issue filter is exact and company-scoped"],
  ["dispatchPage", /reverseIssueId[\s\S]*issue_id:\s*reverseIssueId \|\| undefined/, "dispatch page consumes exact source issue route"],
  ["routes", /SELECT \*[\s\S]*FROM dispatch\.intransit_issues[\s\S]*WHERE id = \$1[\s\S]*AND operating_company_id = \$2[\s\S]*promoted_to_wo_id IS NULL[\s\S]*\[params\.data\.issue_id, query\.data\.operating_company_id\]/, "WO conversion source read is explicitly company-scoped"],
  ["routes", /SET promoted_to_wo_id = \$2[\s\S]*WHERE id = \$1[\s\S]*AND operating_company_id = \$3[\s\S]*\[params\.data\.issue_id, workOrderId, query\.data\.operating_company_id\]/, "WO conversion source update is explicitly company-scoped"],
  ["routes", /convert-to-damage[\s\S]*SELECT \*[\s\S]*FROM dispatch\.intransit_issues[\s\S]*WHERE id = \$1[\s\S]*AND operating_company_id = \$2[\s\S]*\[params\.data\.issue_id, query\.data\.operating_company_id\]/, "damage conversion source read is explicitly company-scoped"],
  ["routes", /SET promoted_to_damage_report_id = \$2[\s\S]*WHERE id = \$1[\s\S]*AND operating_company_id = \$3[\s\S]*\[params\.data\.issue_id, damageReportId, query\.data\.operating_company_id\]/, "damage conversion source update is explicitly company-scoped"],
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
