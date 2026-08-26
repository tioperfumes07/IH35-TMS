#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leafRe":"^tires\\.(create_record|create_brand)$","task":"VERTICAL-CONNECTIVITY-MAINTENANCE-TIRE-CREATORS"} */
import fs from "node:fs";
const ui=fs.readFileSync("apps/frontend/src/pages/maintenance/TireProgramPage.tsx","utf8");
const api=fs.readFileSync("apps/frontend/src/api/maintenance.ts","utf8");
const routes=fs.readFileSync("apps/backend/src/maintenance/tires.routes.ts","utf8");
const tests=fs.readFileSync("apps/backend/src/maintenance/__tests__/tires.routes.test.ts","utf8");
const failures=(source=ui)=>[
  ["mounted record creator",source.includes("+ Create Tire Record")&&source.includes("setMountOpen(true)")],
  ["mounted brand creator",source.includes("+ Create Brand")&&source.includes("setBrandOpen(true)")],
  ["record payload",source.includes("createMaintenanceTireRecord({")&&source.includes("operating_company_id: input.companyId")&&source.includes('input.assetKind === "trailer" ? { equipment_id: input.assetId } : { unit_id: input.assetId }')],
  ["brand payload",source.includes("createMaintenanceTireBrand({")&&source.includes("name: input.name")],
  ["canonical clients",api.includes("/api/v1/maintenance/tires/records")&&api.includes("/api/v1/maintenance/tires/brands")],
  ["canonical inserts",routes.includes("INSERT INTO maintenance.tire_records")&&routes.includes("INSERT INTO maintenance.tire_brands")],
  ["asset ownership",routes.includes("assetBelongsToCompany(client, body.operating_company_id")&&routes.includes("linked_entity_not_in_operating_company")],
  ["audit",routes.includes("maintenance.tire_record.created")&&routes.includes("maintenance.tire_brand.created")],
  ["reload",source.includes('invalidateQueries({ queryKey: ["maintenance", "tire-layout"')&&source.includes('invalidateQueries({ queryKey: ["maintenance", "tire-brands"')],
  ["behavior tests",tests.includes("mounts tire at axle position")&&tests.includes("validating the scoped equipment")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const planted=ui.replace("createMaintenanceTireRecord({","createMaintenanceTireRecordBroken({");if(!failures(planted).includes("record payload"))process.exit(1);console.log("verify-maintenance-tire-creators-connectivity selftest PASS — submit mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-maintenance-tire-creators-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-maintenance-tire-creators-connectivity PASS — record+brand creator→canonical write→audit→reload");
