#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leafRe":"^severe_repairs\\.convert_to_wo$","task":"VERTICAL-CONNECTIVITY-MAINTENANCE-SEVERE-REPAIRS"} */
import fs from "node:fs";
const ui=fs.readFileSync("apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx","utf8");
const migration=fs.readFileSync("db/migrations/0124_p6_active_drift_reconciliation.sql","utf8");
const failures=(source=ui)=>[
  ["real estimate API",source.includes("listSevereRepairEstimates(operatingCompanyId")],
  ["trigger WO detail link",source.includes("row.trigger_wo_id")&&source.includes("/maintenance/work-orders/${row.trigger_wo_id}")],
  ["no duplicate conversion",!source.includes(">\n        Convert to WO\n")&&!source.includes("Convert to WO action")],
  ["canonical trigger",migration.includes("CREATE TRIGGER trg_upsert_severe_repair_estimate")&&migration.includes("AFTER INSERT OR UPDATE")],
  ["unique WO lineage",migration.includes("ux_severe_repair_estimates_trigger_wo_id")&&migration.includes("ON maintenance.severe_repair_estimates (trigger_wo_id)")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const planted=ui.replace("/maintenance/work-orders/${row.trigger_wo_id}","/maintenance/severe-repairs");if(!failures(planted).includes("trigger WO detail link"))process.exit(1);console.log("verify-maintenance-severe-repair-connectivity selftest PASS — WO-detail mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-maintenance-severe-repair-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-maintenance-severe-repair-connectivity PASS — estimate→trigger WO→detail; duplicate conversion removed");
