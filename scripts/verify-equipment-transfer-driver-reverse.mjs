#!/usr/bin/env node
/** @matrix-built modules=drivers,dispatch,fleet cols=driver,trailer,connectivity,reverse_link */
import fs from "node:fs";
const LABEL="verify-equipment-transfer-driver-reverse";
const files={service:"apps/backend/src/dispatch/equipment-transfer/request.service.ts",routes:"apps/backend/src/dispatch/equipment-transfer/routes.ts",reverse:"apps/frontend/src/components/dispatch/DriverEquipmentTransfersReverseSection.tsx",detail:"apps/frontend/src/pages/DriverDetail.tsx",profile:"apps/frontend/src/pages/drivers/DriverProfilePage.tsx"};
const source=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,fs.readFileSync(f,"utf8")]));
function audit(s){const f=[];
 if(!/direction === "both"/.test(s.service)||!/\(r\.from_driver_uuid = \$2::uuid OR r\.to_driver_uuid = \$2::uuid\)/.test(s.service)||!/r\.operating_company_id = \$1::uuid/.test(s.service))f.push("entity-scoped either-role driver reverse missing");
 if(!/z\.enum\(\["outbound", "inbound", "both"\]\)/.test(s.routes)||!/q\.data\.direction/.test(s.routes))f.push("both-direction route contract missing");
 if(!/driver=\$\{encodeURIComponent\(driverId\)\}&direction=both/.test(s.reverse)||!/kind="trailer"/.test(s.reverse))f.push("filtered canonical trailer drill missing");
 if(!/query\.isError/.test(s.reverse)||!/No equipment transfers are linked to this driver/.test(s.reverse))f.push("honest reverse states missing");
 if(!/DriverEquipmentTransfersReverseSection[\s\S]{0,140}driverId=\{id\}/.test(s.detail)||!/DriverEquipmentTransfersReverseSection[\s\S]{0,140}driverId=\{id\}/.test(s.profile))f.push("both driver routes must mount reverse history");
 return f;}
if(process.argv.includes("--selftest")){const m=[["both","service",/direction === "both"/,"direction === 'outbound'"],["from","service",/r\.from_driver_uuid = \$2::uuid/,"FALSE"],["to","service",/r\.to_driver_uuid = \$2::uuid/,"FALSE"],["scope","service",/r\.operating_company_id = \$1::uuid/g,"TRUE"],["route","routes",/"outbound", "inbound", "both"/,"outbound", "inbound"],["filter","reverse",/driver=\$\{encodeURIComponent\(driverId\)\}&direction=both/,"driver="],["drill","reverse",/kind="trailer"/,'kind="driver"'],["empty","reverse",/No equipment transfers are linked to this driver/,"No rows"],["detail","detail",/DriverEquipmentTransfersReverseSection/g,"MissingTransferReverse"],["profile","profile",/DriverEquipmentTransfersReverseSection/g,"MissingTransferReverse"]];for(const[n,k,p,r]of m){const c={...source,[k]:source[k].replace(p,r)};if(c[k]===source[k]||audit(c).length===0){console.error(`${LABEL} SELFTEST FAIL — ${n}`);process.exit(1)}}console.log(`${LABEL} SELFTEST PASS — ${m.length} mutations detected`);process.exit(0)}
const failures=audit(source);if(failures.length){console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);process.exit(1)}console.log(`${LABEL} PASS — transfer driver FK either-role reverse→both driver routes→trailer drill`);
