#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leafRe":"^maintenance\\.modal\\.work_order_create$","task":"VERTICAL-CONNECTIVITY-MAINTENANCE-WO-CREATE-MODAL"} */
import fs from "node:fs";
const modal=fs.readFileSync("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx","utf8");
const home=fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx","utf8");
const page=fs.readFileSync("apps/frontend/src/pages/maintenance/WorkOrderNewPage.tsx","utf8");
const trailerAction=fs.readFileSync("apps/frontend/src/components/trailer-profile/ActionBar.tsx","utf8");
const required=fs.readFileSync("docs/specs/scoreboard/modules/maintenance.required.json","utf8");
const inventory=fs.readFileSync("docs/specs/scoreboard/surface-inventory-2026-08-12.json","utf8");
const livePath="pages/maintenance/components/CreateWorkOrderModal.tsx";
const failures=(sources={modal,page,trailerAction})=>[
 ["live inventory",required.includes(`surface://${livePath}`)&&inventory.includes(`surface://${livePath}`)],
 ["home mount",home.includes("<CreateWorkOrderModal")],
 ["route mount",sources.page.includes("<CreateWorkOrderModal")],
 ["unit deep-link",sources.page.includes('searchParams.get("unit_id")')&&sources.page.includes("unit_id: unitId")],
 ["trailer deep-link source",sources.trailerAction.includes("/maintenance/work-orders/new?equipment_id=${equipmentId}")],
 ["trailer deep-link read",sources.page.includes('searchParams.get("equipment_id")')],
 ["trailer deep-link prefill",sources.page.includes("equipment_id: equipmentId")],
 ["canonical submit",sources.modal.includes("await createWorkOrder({")],
 ["company scope",sources.modal.includes("operating_company_id: operatingCompanyId")],
 ["parent reload",sources.modal.includes("onCreated();")],
 ["orphan excluded",!required.includes('surface://pages/maintenance/WorkOrderCreateModal.tsx')&&!inventory.includes('surface://pages/maintenance/WorkOrderCreateModal.tsx')],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){
 const mutations=[
  ["canonical submit",{modal:modal.replace("await createWorkOrder({","await createWorkOrderBroken({"),page,trailerAction}],
  ["trailer deep-link read",{modal,page:page.replace('searchParams.get("equipment_id")','searchParams.get("discarded_equipment_id")'),trailerAction}],
  ["trailer deep-link prefill",{modal,page:page.replace("equipment_id: equipmentId","equipment_id: \"\""),trailerAction}],
 ];
 for(const [expected,sources] of mutations){if(!failures(sources).includes(expected))process.exit(1);}
 console.log(`verify-maintenance-work-order-create-modal-connectivity selftest PASS — ${mutations.length} mutations red`);process.exit(0);
}
const missing=failures();if(missing.length){console.error(`verify-maintenance-work-order-create-modal-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-maintenance-work-order-create-modal-connectivity PASS — inventory→mounted modal→canonical create→reload");
