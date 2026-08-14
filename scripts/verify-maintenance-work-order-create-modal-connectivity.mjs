#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leafRe":"^maintenance\\.modal\\.work_order_create$","task":"VERTICAL-CONNECTIVITY-MAINTENANCE-WO-CREATE-MODAL"} */
import fs from "node:fs";
const modal=fs.readFileSync("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx","utf8");
const home=fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx","utf8");
const page=fs.readFileSync("apps/frontend/src/pages/maintenance/WorkOrderNewPage.tsx","utf8");
const required=fs.readFileSync("docs/specs/scoreboard/modules/maintenance.required.json","utf8");
const inventory=fs.readFileSync("docs/specs/scoreboard/surface-inventory-2026-08-12.json","utf8");
const livePath="pages/maintenance/components/CreateWorkOrderModal.tsx";
const failures=(source=modal)=>[
 ["live inventory",required.includes(`surface://${livePath}`)&&inventory.includes(`surface://${livePath}`)],
 ["home mount",home.includes("<CreateWorkOrderModal")],
 ["route mount",page.includes("<CreateWorkOrderModal")],
 ["canonical submit",source.includes("await createWorkOrder({")],
 ["company scope",source.includes("operating_company_id: operatingCompanyId")],
 ["parent reload",source.includes("onCreated();")],
 ["orphan excluded",!required.includes('surface://pages/maintenance/WorkOrderCreateModal.tsx')&&!inventory.includes('surface://pages/maintenance/WorkOrderCreateModal.tsx')],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const planted=modal.replace("await createWorkOrder({","await createWorkOrderBroken({");if(!failures(planted).includes("canonical submit"))process.exit(1);console.log("verify-maintenance-work-order-create-modal-connectivity selftest PASS — submit mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-maintenance-work-order-create-modal-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-maintenance-work-order-create-modal-connectivity PASS — inventory→mounted modal→canonical create→reload");
