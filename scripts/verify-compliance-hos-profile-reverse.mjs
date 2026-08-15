#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leafRe":"^(tab\.hos_tracker|fleet\.hos_board)$","task":"VERTICAL-REVERSE-LINK-COMPLIANCE-HOS"} */
import fs from "node:fs";
const driver=fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx","utf8");
const unit=fs.readFileSync("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx","utf8");
const tracker=fs.readFileSync("apps/frontend/src/pages/compliance/HosTrackerSection.tsx","utf8");
const fleet=fs.readFileSync("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx","utf8");
const entityLink=fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx","utf8");
const required=fs.readFileSync("docs/specs/scoreboard/modules/compliance.required.json","utf8");
function failures(s={}){const d=s.driver??driver,u=s.unit??unit,t=s.tracker??tracker,f=s.fleet??fleet,e=s.entityLink??entityLink,r=s.required??required;return [
 ["driver profile HOS deep link",d.includes('kind="compliance_hos_driver"')&&d.includes("id={id}")&&e.includes('case "compliance_hos_driver":')&&e.includes('return `/compliance?tab=hos_tracker&driver_id=${id}`')],
 ["driver target honored",t.includes('searchParams.get("driver_id")')&&t.includes("driver.driver_id === effectiveDriverId")&&t.includes("setSelectedDriver(requested)")&&t.includes('dataTestId="hos-tracker-filter-driver"')&&t.includes("allowCreate={false}")&&t.includes("filteredDrivers")],
 ["unit profile fleet HOS deep link",u.includes('kind="compliance_unit_overview"')&&u.includes("id={id}")&&e.includes('case "compliance_unit_overview":')&&e.includes('return `/compliance?tab=overview&unit_id=${id}`')],
 ["unit target honored",f.includes('searchParams.get("unit_id")')&&f.includes("row.unit_id === effectiveUnitId")&&f.includes('dataTestId="fleet-hos-filter-unit"')&&f.includes("allowCreate={false}")],
 ["offline target revealed",f.includes("effectiveUnitId && offlineRows.length > 0")&&f.includes("setShowOffline(true)")],
 ["canonical fleet route",JSON.parse(r).leaves.find((leaf)=>leaf.id==="fleet.hos_board")?.route_hint==="/compliance?tab=overview"],
].filter(([,ok])=>!ok).map(([name])=>name)}
if(process.argv.includes("--selftest")){const checks=[
 failures({entityLink:entityLink.replace('return `/compliance?tab=hos_tracker&driver_id=${id}`','return `/compliance?tab=hos_tracker`')}).includes("driver profile HOS deep link"),
 failures({tracker:tracker.replace('dataTestId="hos-tracker-filter-driver"','dataTestId="x"')}).includes("driver target honored"),
 failures({entityLink:entityLink.replace('return `/compliance?tab=overview&unit_id=${id}`','return `/compliance?tab=overview`')}).includes("unit profile fleet HOS deep link"),
 failures({fleet:fleet.replaceAll("row.unit_id === effectiveUnitId","true")}).includes("unit target honored"),
 failures({fleet:fleet.replace('dataTestId="fleet-hos-filter-unit"','dataTestId="x"')}).includes("unit target honored"),
];if(checks.some((ok)=>!ok)){console.error(`verify-compliance-hos-profile-reverse selftest FAIL — mutations ${checks.map((ok,index)=>ok?null:index+1).filter(Boolean).join(", ")} stayed green`);process.exit(1)}console.log("verify-compliance-hos-profile-reverse selftest PASS — 5/5 source/target mutations red");process.exit(0)}
const missing=failures();if(missing.length){console.error(`verify-compliance-hos-profile-reverse FAIL — ${missing.join(", ")}`);process.exit(1)}console.log("verify-compliance-hos-profile-reverse PASS — driver/unit profiles land on exact HOS rows");
