#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leafRe":"^(tab\.hos_tracker|fleet\.hos_board)$","task":"VERTICAL-REVERSE-LINK-COMPLIANCE-HOS"} */
import fs from "node:fs";
const driver=fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx","utf8");
const unit=fs.readFileSync("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx","utf8");
const tracker=fs.readFileSync("apps/frontend/src/pages/compliance/HosTrackerSection.tsx","utf8");
const fleet=fs.readFileSync("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx","utf8");
const required=fs.readFileSync("docs/specs/scoreboard/modules/compliance.required.json","utf8");
function failures(s={}){const d=s.driver??driver,u=s.unit??unit,t=s.tracker??tracker,f=s.fleet??fleet,r=s.required??required;return [
 ["driver profile HOS deep link",d.includes('/compliance?tab=hos_tracker&driver_id=${encodeURIComponent(id)}')],
 ["driver target honored",t.includes('searchParams.get("driver_id")')&&t.includes("driver.driver_id === requestedDriverId")&&t.includes("setSelectedDriver(requested)")],
 ["unit profile fleet HOS deep link",u.includes('/compliance?tab=overview&unit_id=${encodeURIComponent(id)}')],
 ["unit target honored",f.includes('searchParams.get("unit_id")')&&f.includes("row.unit_id === requestedUnitId")],
 ["offline target revealed",f.includes("requestedUnitId && offlineRows.length > 0")&&f.includes("setShowOffline(true)")],
 ["canonical fleet route",JSON.parse(r).leaves.find((leaf)=>leaf.id==="fleet.hos_board")?.route_hint==="/compliance?tab=overview"],
].filter(([,ok])=>!ok).map(([name])=>name)}
if(process.argv.includes("--selftest")){const checks=[
 failures({driver:driver.replace("driver_id=${encodeURIComponent(id)}","driver_id=")}).includes("driver profile HOS deep link"),
 failures({tracker:tracker.replace("driver.driver_id === requestedDriverId","false")}).includes("driver target honored"),
 failures({unit:unit.replace('/compliance?tab=overview&unit_id=${encodeURIComponent(id)}','/compliance?tab=overview')}).includes("unit profile fleet HOS deep link"),
 failures({fleet:fleet.replaceAll("row.unit_id === requestedUnitId","true")}).includes("unit target honored"),
];if(checks.some((ok)=>!ok)){console.error(`verify-compliance-hos-profile-reverse selftest FAIL — mutations ${checks.map((ok,index)=>ok?null:index+1).filter(Boolean).join(", ")} stayed green`);process.exit(1)}console.log("verify-compliance-hos-profile-reverse selftest PASS — 4/4 source/target mutations red");process.exit(0)}
const missing=failures();if(missing.length){console.error(`verify-compliance-hos-profile-reverse FAIL — ${missing.join(", ")}`);process.exit(1)}console.log("verify-compliance-hos-profile-reverse PASS — driver/unit profiles land on exact HOS rows");
