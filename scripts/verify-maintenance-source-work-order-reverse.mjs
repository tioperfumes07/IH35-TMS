#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^(defects\.convert_to_wo|pre_flight_dvir\.queue|maintenance\.panel\.pm_alerts)$","task":"VERTICAL-REVERSE-LINK-MAINTENANCE-SOURCE-WO"} */
import fs from "node:fs";
const defectsRoute=fs.readFileSync("apps/backend/src/maintenance/defects.routes.ts","utf8");
const alertsRoute=fs.readFileSync("apps/backend/src/maintenance/pm-alerts.routes.ts","utf8");
const defect=fs.readFileSync("apps/frontend/src/pages/maintenance/DefectDetailPage.tsx","utf8");
const inbox=fs.readFileSync("apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx","utf8");
const preflight=fs.readFileSync("apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx","utf8");
const alerts=fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx","utf8");
const api=fs.readFileSync("apps/frontend/src/api/maintenance.ts","utf8");
const failures=(d=defect,p=preflight,a=alerts,r=defectsRoute,i=inbox)=>[
 ["defect scoped display join",defectsRoute.includes("wo.display_id AS follow_up_wo_display_id")&&defectsRoute.includes("wo.operating_company_id = dd.operating_company_id")],
 ["defect WO drill",d.includes('EntityLinkOrTombstone kind="work_order" id={defect.follow_up_wo_id} name={defect.follow_up_wo_display_id} noun="Work order"')],
 ["defect unit drill",d.includes('EntityLinkOrTombstone kind="unit" id={defect.unit_id} name={defect.unit_number} noun="Unit"')],
 ["defect driver drill",d.includes('EntityLinkOrTombstone kind="driver" id={defect.driver_id} name={defect.driver_name} noun="Driver"')],
 ["defect inbox display join",(r.match(/wo\.display_id AS follow_up_wo_display_id/g)??[]).length>=2&&(r.match(/wo\.operating_company_id = dd\.operating_company_id/g)??[]).length>=2],
 ["defect inbox WO drill",i.includes('kind="work_order"')&&i.includes("id={row.follow_up_wo_id}")&&i.includes("row.follow_up_wo_display_id")],
 ["defect inbox duplicate conversion suppressed",i.includes("!row.follow_up_wo_id ? (")],
 ["preflight WO drill",p.includes('EntityLinkOrTombstone kind="work_order" id={row.work_order_id} name={row.work_order_display_id} noun="Work order"')],
 ["scheduled query",a.includes('listMaintenancePmAlerts(operatingCompanyId, "scheduled")')],
 ["scheduled reverse surface",a.includes('data-testid="pm-alerts-scheduled-reverse"')],
 ["scheduled WO drill",a.includes('kind="work_order" id={alert.scheduled_work_order_id}')&&a.includes("alert.scheduled_work_order_display_id")],
 ["scheduled scoped display join",alertsRoute.includes("wo.display_id AS scheduled_work_order_display_id")&&alertsRoute.includes("wo.operating_company_id = a.operating_company_id")],
 ["state sent",api.includes('if (state) params.set("state", state)')],
].filter(([,ok])=>!ok).map(([name])=>name);
if (process.argv.includes("--selftest")) {
  const d = defect.replace('kind="work_order" id={defect.follow_up_wo_id}', 'kind="unit" id={defect.follow_up_wo_id}');
  const unitDefect = defect.replace('name={defect.unit_number}', 'name={null}');
  const driverDefect = defect.replace('name={defect.driver_name}', 'name={null}');
  const p = preflight.replace(
    'EntityLinkOrTombstone kind="work_order" id={row.work_order_id} name={row.work_order_display_id} noun="Work order"',
    'EntityLinkOrTombstone kind="unit" id={row.work_order_id} name={null} noun="Unit"'
  );
  const a = alerts.replace('kind="work_order" id={alert.scheduled_work_order_id}', 'kind="unit" id={alert.scheduled_work_order_id}');
  const checks = [
    failures(d, preflight, alerts).includes("defect WO drill"),
    failures(unitDefect, preflight, alerts).includes("defect unit drill"),
    failures(driverDefect, preflight, alerts).includes("defect driver drill"),
    failures(defect, p, alerts).includes("preflight WO drill"),
    failures(defect, preflight, a).includes("scheduled WO drill"),
    failures(defect, preflight, alerts, defectsRoute.replace("wo.display_id AS follow_up_wo_display_id", "NULL AS follow_up_wo_display_id"), inbox).includes("defect inbox display join"),
    failures(defect, preflight, alerts, defectsRoute.replace("AND wo.operating_company_id = dd.operating_company_id", ""), inbox).includes("defect inbox display join"),
    failures(defect, preflight, alerts, defectsRoute, inbox.replace('id={row.follow_up_wo_id}', 'id={undefined}')).includes("defect inbox WO drill"),
    failures(defect, preflight, alerts, defectsRoute, inbox.replace("!row.follow_up_wo_id ? (", "true ? (")).includes("defect inbox duplicate conversion suppressed"),
  ];
  if (checks.some((x) => !x)) {
    console.error(`verify-maintenance-source-work-order-reverse selftest FAIL — ${checks.map((ok, index) => ok ? null : index + 1).filter(Boolean).join(",")}`);
    process.exit(1);
  }
  console.log(`verify-maintenance-source-work-order-reverse selftest PASS — ${checks.length}/${checks.length} mutations red`);
  process.exit(0);
}
const missing=failures();if(missing.length){console.error(`verify-maintenance-source-work-order-reverse FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-maintenance-source-work-order-reverse PASS — defect/pre-flight/PM-alert→persisted WO drills");
