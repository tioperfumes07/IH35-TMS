#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leafRe":"^(tab\.hos_tracker|fleet\.hos_board)$","task":"VERTICAL-REVERSE-LINK-COMPLIANCE-HOS"} */
import fs from "node:fs";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from './lib/entity-multiselect-filter-contract.mjs';
const listSources = Object.fromEntries(Object.entries({
  rosterRoute: 'apps/backend/src/telematics/hos-tracker.routes.ts',
  rosterService: 'apps/backend/src/telematics/hos-tracker.service.ts',
  fleetRoute: 'apps/backend/src/telematics/fleet-location-hos.routes.ts',
  fleetService: 'apps/backend/src/telematics/fleet-location-hos.service.ts',
  rosterApi: 'apps/frontend/src/api/hosTracker.ts',
  fleetApi: 'apps/frontend/src/api/reports.ts',
}).map(([key,file]) => [key, fs.readFileSync(file,'utf8')]));
function fullListProblems(s) {
  const p={...listSources,...s};
  return [
    ['driver list full bound scope', p.rosterRoute.includes('driver_id: entityIdFilterSchema.optional()') && p.rosterRoute.includes('entityIdFilterValues(q.data.driver_id)') && p.rosterService.includes('a.driver_id = ANY($2::uuid[])') && p.rosterService.includes('a.operating_company_id = $1::uuid') && p.rosterService.includes('[operatingCompanyId, driverIds ?? null]') && p.rosterApi.includes('encodeURIComponent(driverId)')],
    ['unit list full bound scope', p.fleetRoute.includes('unit_id: entityIdFilterSchema.optional()') && p.fleetRoute.includes('entityIdFilterValues(query.data.unit_id)') && p.fleetService.includes('u.id = ANY($2::uuid[])') && p.fleetService.includes('COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid') && p.fleetService.includes('[operatingCompanyId, unitIds ?? null]') && p.fleetApi.includes('encodeURIComponent(unitId)')],
  ].filter(([,ok])=>!ok).map(([name])=>name);
}
const driver=fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx","utf8");
const unit=fs.readFileSync("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx","utf8");
const tracker=fs.readFileSync("apps/frontend/src/pages/compliance/HosTrackerSection.tsx","utf8");
const fleet=fs.readFileSync("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx","utf8");
const entityLink=fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx","utf8");
const required=fs.readFileSync("docs/specs/scoreboard/modules/compliance.required.json","utf8");
function failures(s={}){const d=s.driver??driver,u=s.unit??unit,t=s.tracker??tracker,f=s.fleet??fleet,e=s.entityLink??entityLink,r=s.required??required;return [
 ["driver profile HOS deep link",d.includes('kind="compliance_hos_driver"')&&d.includes("id={id}")&&e.includes('case "compliance_hos_driver":')&&e.includes('return `/compliance?tab=hos_tracker&driver_id=${id}`')],
 ["driver target honored",t.includes('searchParams.get("driver_id")')&&t.includes("driver.driver_id === effectiveDriverId")&&t.includes("setSelectedDriver(requested)")&&t.includes('effectiveDriverId.includes(",")')&&t.includes('getHosDailyRoster(operatingCompanyId, selectedDate, effectiveDriverId)')&&!multiSelectFilterProblems(t,{file:'apps/frontend/src/pages/compliance/HosTrackerSection.tsx',kind:'driver',testId:'hos-tracker-filter-driver'}).length&&t.includes("const filteredDrivers = roster?.drivers ?? []")],
 ["unit profile fleet HOS deep link",u.includes('kind="compliance_unit_overview"')&&u.includes("id={id}")&&e.includes('case "compliance_unit_overview":')&&e.includes('return `/compliance?tab=overview&unit_id=${id}`')],
 ["unit target honored",f.includes('searchParams.get("unit_id")')&&f.includes('getFleetLocationHos(companyId, effectiveUnitId)')&&f.includes('const allRows = query.data?.rows ?? []')&&!multiSelectFilterProblems(f,{file:'apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx',kind:'unit',testId:'fleet-hos-filter-unit'}).length],
 ["offline target revealed",f.includes("effectiveUnitId && offlineRows.length > 0")&&f.includes("setShowOffline(true)")],
 ["canonical fleet route",JSON.parse(r).leaves.find((leaf)=>leaf.id==="fleet.hos_board")?.route_hint==="/compliance?tab=overview"],
 ["leftover text-[11px]",!t.includes("text-[11px]")],
 ["leftover off-scale muted",!t.includes("#8A92AB")&&!t.includes("#334155")],
].filter(([,ok])=>!ok).map(([name])=>name).concat(fullListProblems(s))}
if(process.argv.includes("--selftest")){if(failures().length)throw new Error(failures().join('; '));selftestMultiSelectFilterContract();const checks=[
 failures({entityLink:entityLink.replace('return `/compliance?tab=hos_tracker&driver_id=${id}`','return `/compliance?tab=hos_tracker`')}).includes("driver profile HOS deep link"),
 failures({tracker:tracker.replace('dataTestId="hos-tracker-filter-driver"','dataTestId="x"')}).includes("driver target honored"),
 failures({entityLink:entityLink.replace('return `/compliance?tab=overview&unit_id=${id}`','return `/compliance?tab=overview`')}).includes("unit profile fleet HOS deep link"),
 failures({fleet:fleet.replaceAll("getFleetLocationHos(companyId, effectiveUnitId)","getFleetLocationHos(companyId)")}).includes("unit target honored"),
 failures({rosterService:listSources.rosterService.replaceAll('a.driver_id = ANY($2::uuid[])','TRUE')}).includes('driver list full bound scope'),
 failures({rosterService:listSources.rosterService.replaceAll('a.operating_company_id = $1::uuid','TRUE')}).includes('driver list full bound scope'),
 failures({fleetService:listSources.fleetService.replaceAll('u.id = ANY($2::uuid[])','TRUE')}).includes('unit list full bound scope'),
 failures({fleetService:listSources.fleetService.replaceAll('COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid','TRUE')}).includes('unit list full bound scope'),
 failures({fleetRoute:listSources.fleetRoute.replaceAll('entityIdFilterValues(query.data.unit_id)','query.data.unit_id')}).includes('unit list full bound scope'),
 failures({fleet:fleet.replace('dataTestId="fleet-hos-filter-unit"','dataTestId="x"')}).includes("unit target honored"),
 failures({tracker:`${tracker}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`}).includes("leftover text-[11px]") &&
   failures({tracker:`${tracker}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`}).includes("leftover off-scale muted"),
];if(checks.some((ok)=>!ok)){console.error(`verify-compliance-hos-profile-reverse selftest FAIL — mutations ${checks.map((ok,index)=>ok?null:index+1).filter(Boolean).join(", ")} stayed green`);process.exit(1)}console.log(`verify-compliance-hos-profile-reverse selftest PASS — ${checks.length}/${checks.length} source/target mutations red`);process.exit(0)}
const missing=failures();if(missing.length){console.error(`verify-compliance-hos-profile-reverse FAIL — ${missing.join(", ")}`);process.exit(1)}console.log("verify-compliance-hos-profile-reverse PASS — driver/unit profiles land on exact HOS rows");
