#!/usr/bin/env node
/** @matrix-built modules=dispatch,fleet,drivers cols=trailer,driver,connectivity,reverse_link,picker_law */
import fs from "node:fs";
const LABEL = "verify-equipment-transfer-trailer-linkage";
const files = { creator:"apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx", service:"apps/backend/src/dispatch/equipment-transfer/request.service.ts", routes:"apps/backend/src/dispatch/equipment-transfer/routes.ts", reverse:"apps/frontend/src/components/dispatch/EquipmentTransfersReverseSection.tsx", profile:"apps/frontend/src/pages/fleet/TrailerProfilePage.tsx" };
const source = Object.fromEntries(Object.entries(files).map(([k,f]) => [k, fs.readFileSync(f,"utf8")]));
function audit(s) {
  const f=[];
  if (!/kind="trailer"/.test(s.creator) || !/equipment_uuid: equipmentUuid/.test(s.creator) || (s.creator.match(/kind="driver"/g)??[]).length<2) f.push("canonical equipment and driver picker payload missing");
  if ((s.service.match(/SELECT id::text, equipment_type/g)??[]).length<2 || !/deactivated_at IS NULL/.test(s.service) || !/equipment_kind_mismatch/.test(s.service)) f.push("active scoped equipment kind validation missing");
  if (!/r\.equipment_uuid = \$2::uuid/.test(s.service) || !/r\.operating_company_id = \$1::uuid/.test(s.service)) f.push("exact entity-scoped equipment reverse filter missing");
  if (!/equipment_uuid: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.routes) || !/q\.data\.equipment_uuid/.test(s.routes)) f.push("reverse route contract missing");
  if (!/equipment_uuid=\$\{encodeURIComponent\(equipmentId\)\}/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No equipment transfers are linked to this trailer/.test(s.reverse)) f.push("honest filtered reverse section missing");
  if (!/EquipmentTransfersReverseSection companyId=\{companyId\} equipmentId=\{id\}/.test(s.profile)) f.push("trailer profile reverse mount missing");
  return f;
}
if(process.argv.includes("--selftest")){
  const m=[["picker","creator",/kind="trailer"/,'kind="unit"'],["payload","creator",/equipment_uuid: equipmentUuid/,"equipment_uuid: ''"],["type","service",/SELECT id::text, equipment_type/,"SELECT id::text"],["active","service",/deactivated_at IS NULL/g,"TRUE"],["filter","service",/r\.equipment_uuid = \$2::uuid/,"TRUE"],["scope","service",/r\.operating_company_id = \$1::uuid/g,"TRUE"],["route","routes",/q\.data\.equipment_uuid/,"undefined"],["reverse","reverse",/equipment_uuid=\$\{encodeURIComponent\(equipmentId\)\}/,"equipment_uuid="],["empty","reverse",/No equipment transfers are linked to this trailer/,"No rows"],["mount","profile",/EquipmentTransfersReverseSection/g,"MissingTransferReverse"]];
  for(const [n,k,p,r] of m){const c={...source,[k]:source[k].replace(p,r)};if(c[k]===source[k]||audit(c).length===0){console.error(`${LABEL} SELFTEST FAIL — ${n}`);process.exit(1)}}
  console.log(`${LABEL} SELFTEST PASS — ${m.length} mutations detected`);process.exit(0);
}
const failures=audit(source);if(failures.length){console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);process.exit(1)}
console.log(`${LABEL} PASS — trailer/driver pickers→active kind validation→transfer FKs→exact Trailer Profile reverse`);
