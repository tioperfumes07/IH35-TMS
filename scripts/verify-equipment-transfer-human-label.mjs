#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","drivers"],"cols":["trailer","connectivity","reverse_link"],"leafRe":"^dispatch\\.modal\\.equipment_transfer$|^docs\\.equipment_transfers$|^profiles\\.detail$","task":"THEATER-EQUIPMENT-TRANSFER-HUMAN-LABEL-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-equipment-transfer-human-label";
const service = fs.readFileSync("apps/backend/src/dispatch/equipment-transfer/request.service.ts", "utf8");
const reverse = fs.readFileSync("apps/frontend/src/components/dispatch/DriverEquipmentTransfersReverseSection.tsx", "utf8");
function audit(s, v) {
  const failures = [];
  const driverQuery = s.slice(s.indexOf('if (direction === "both")'), s.indexOf("const dir = direction"));
  if (!/e\.equipment_number/.test(driverQuery) || !/LEFT JOIN mdata\.equipment e ON e\.id = r\.equipment_uuid/.test(driverQuery) || !/e\.owner_company_id = r\.operating_company_id OR e\.currently_leased_to_company_id = r\.operating_company_id/.test(driverQuery)) failures.push("scoped equipment label join missing from either-role driver query");
  if (!/<EntityLinkOrTombstone[\s\S]{0,160}kind="trailer"[\s\S]{0,160}id=\{row\.equipment_uuid\}[\s\S]{0,160}name=\{row\.equipment_number\}[\s\S]{0,160}noun=\{row\.equipment_kind \|\| "Equipment"\}/.test(v)) failures.push("human trailer label and canonical drill not used");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const start = service.indexOf('if (direction === "both")');
  const end = service.indexOf("const dir = direction");
  const prefix = service.slice(0, start), block = service.slice(start, end), suffix = service.slice(end);
  const mutations = [["select", prefix + block.replace(/e\.equipment_number/, "NULL") + suffix, reverse], ["join", prefix + block.replace(/LEFT JOIN mdata\.equipment e ON e\.id = r\.equipment_uuid/, "LEFT JOIN mdata.equipment e ON FALSE") + suffix, reverse], ["scope", prefix + block.replace(/e\.owner_company_id = r\.operating_company_id OR e\.currently_leased_to_company_id = r\.operating_company_id/, "TRUE") + suffix, reverse], ["label", service, reverse.replace(/row\.equipment_number/, "null")]];
  for (const [name, s, v] of mutations) if (!audit(s, v).length) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 4 mutations detected`); process.exit(0);
}
const failures = audit(service, reverse);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — scoped trailer label→driver reverse canonical drill`);
