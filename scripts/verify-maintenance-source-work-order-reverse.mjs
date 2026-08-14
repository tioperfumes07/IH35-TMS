#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^(defects\.convert_to_wo|pre_flight_dvir\.queue|maintenance\.panel\.pm_alerts)$","task":"VERTICAL-REVERSE-LINK-MAINTENANCE-SOURCE-WO"} */
import fs from "node:fs";
const defectsRoute=fs.readFileSync("apps/backend/src/maintenance/defects.routes.ts","utf8");
const alertsRoute=fs.readFileSync("apps/backend/src/maintenance/pm-alerts.routes.ts","utf8");
const defect=fs.readFileSync("apps/frontend/src/pages/maintenance/DefectDetailPage.tsx","utf8");
const preflight=fs.readFileSync("apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx","utf8");
const alerts=fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx","utf8");
const api=fs.readFileSync("apps/frontend/src/api/maintenance.ts","utf8");
const failures=(d=defect,p=preflight,a=alerts)=>[
 ["defect scoped display join",defectsRoute.includes("wo.display_id AS follow_up_wo_display_id")&&defectsRoute.includes("wo.operating_company_id = dd.operating_company_id")],
 ["defect WO drill",d.includes('kind="work_order" id={defect.follow_up_wo_id}')&&d.includes("defect.follow_up_wo_display_id")],
 ["preflight WO drill",p.includes('kind="work_order" id={row.work_order_id ?? row.auto_wo_id}')&&p.includes("row.work_order_display_id")],
 ["scheduled query",a.includes('listMaintenancePmAlerts(operatingCompanyId, "scheduled")')],
 ["scheduled reverse surface",a.includes('data-testid="pm-alerts-scheduled-reverse"')],
 ["scheduled WO drill",a.includes('kind="work_order" id={alert.scheduled_work_order_id}')&&a.includes("alert.scheduled_work_order_display_id")],
 ["scheduled scoped display join",alertsRoute.includes("wo.display_id AS scheduled_work_order_display_id")&&alertsRoute.includes("wo.operating_company_id = a.operating_company_id")],
 ["state sent",api.includes('if (state) params.set("state", state)')],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const d=defect.replace('kind="work_order" id={defect.follow_up_wo_id}','kind="unit" id={defect.follow_up_wo_id}');const p=preflight.replace('kind="work_order" id={row.work_order_id ?? row.auto_wo_id}','kind="unit" id={row.work_order_id ?? row.auto_wo_id}');const a=alerts.replace('kind="work_order" id={alert.scheduled_work_order_id}','kind="unit" id={alert.scheduled_work_order_id}');const checks=[failures(d,preflight,alerts).includes("defect WO drill"),failures(defect,p,alerts).includes("preflight WO drill"),failures(defect,preflight,a).includes("scheduled WO drill")];if(checks.some(x=>!x))process.exit(1);console.log("verify-maintenance-source-work-order-reverse selftest PASS — 3/3 EntityLink mutations red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-maintenance-source-work-order-reverse FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-maintenance-source-work-order-reverse PASS — defect/pre-flight/PM-alert→persisted WO drills");
