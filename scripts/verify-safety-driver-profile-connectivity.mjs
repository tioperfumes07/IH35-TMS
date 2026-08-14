#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^safety\.panel\.driver_safety_profile$","task":"VERTICAL-CONNECTIVITY-SAFETY-DRIVER-PROFILE"} */
import fs from "node:fs";
const page=fs.readFileSync("apps/frontend/src/pages/safety/driver-safety/DriverSafetyProfilePage.tsx","utf8");
const panel=fs.readFileSync("apps/frontend/src/components/safety/driver-safety/DriverSafetyProfilePanel.tsx","utf8");
const api=fs.readFileSync("apps/frontend/src/api/mdata.ts","utf8");
const manifest=fs.readFileSync("apps/frontend/src/routes/manifest.tsx","utf8");
const backend=fs.readFileSync("apps/backend/src/mdata/driver-aggregate.service.ts","utf8");
const failures=(p=page)=>[
 ["mounted parameterized route",manifest.includes('path="driver-profiles/:driverId"')],
 ["route param consumed",p.includes('useParams<{ driverId: string }>()')],
 ["company-scoped aggregate",p.includes("getDriverSafetyAggregate(driverId, companyId)")&&api.includes("operating_company_id: operatingCompanyId")],
 ["canonical medical source",backend.includes("FROM safety.medical_cards")&&backend.includes("medical_card")],
 ["canonical training source",backend.includes("FROM safety.training_records")&&backend.includes("training_records")],
 ["real driver identity",p.includes("driver.first_name")&&p.includes("driver.cdl_number")&&!p.includes("DRV-0000")],
 ["derived safety counts",p.includes("dqMissingCount")&&p.includes("trainingDueCount")],
 ["driver drill-through",panel.includes('<EntityLink kind="driver"')],
 ["dead local upload removed",!p.includes("DriverDocumentUploadField")&&!p.includes("No file selected")],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){const m=page.replace("getDriverSafetyAggregate(driverId, companyId)","getDriverSafetyAggregate(driverId, '')");if(!failures(m).includes("company-scoped aggregate"))process.exit(1);console.log("verify-safety-driver-profile-connectivity selftest PASS — company-scope mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-safety-driver-profile-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-safety-driver-profile-connectivity PASS — route driver→scoped aggregate→medical/training/DQ+drill");
