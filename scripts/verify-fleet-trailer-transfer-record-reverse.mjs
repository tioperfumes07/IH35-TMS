#!/usr/bin/env node
import fs from "node:fs";

const files = {
  reverse: fs.readFileSync("apps/frontend/src/components/dispatch/EquipmentTransfersReverseSection.tsx", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", "utf8"),
  route: fs.readFileSync("apps/backend/src/dispatch/equipment-transfer/routes.ts", "utf8"),
  service: fs.readFileSync("apps/backend/src/dispatch/equipment-transfer/request.service.ts", "utf8"),
  manifest: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

function audit(s = files) {
  const failures = [];
  if (!/<EntityLink kind="equipment_transfer" id=\{transfer\.uuid\} label=\{`Equipment transfer · \$\{transfer\.status\}`\}/.test(s.reverse)) failures.push("profile transfer row has no canonical exact record drill");
  if (!/case "equipment_transfer":[\s\S]{0,100}\/dispatch\/equipment-transfers\?transfer_id=\$\{id\}/.test(s.entityLink)) failures.push("shared resolver lacks exact equipment-transfer route");
  if (!s.page.includes('get("transfer_id")') || !s.page.includes('&transfer_id=${encodeURIComponent(transferId)}')) failures.push("queue does not consume and forward exact transfer id");
  if (!s.route.includes('transfer_id: z.string().uuid().optional()') || !s.route.includes("q.data.transfer_id")) failures.push("route does not validate and forward transfer id");
  if (!/if \(requestUuid\)[\s\S]{0,1800}r\.operating_company_id = \$1::uuid[\s\S]{0,120}r\.uuid = \$2::uuid/.test(s.service)) failures.push("producer lacks exact entity-scoped transfer lookup");
  if (!/listPendingForDriver\(client, operatingCompanyId, driverUuid, direction, equipmentUuid, requestUuid\)/.test(s.service)) failures.push("authenticated producer wrapper drops transfer id");
  if (!s.manifest.includes('path="/dispatch/equipment-transfers"')) failures.push("target route is not mounted");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["reverse", 'kind="equipment_transfer"', 'kind="trailer"'],
    ["entityLink", 'case "equipment_transfer"', 'case "equipment_transfer_missing"'],
    ["page", 'get("transfer_id")', 'get("ignored")'],
    ["route", "q.data.transfer_id", "undefined"],
    ["service", "r.operating_company_id = $1::uuid", "TRUE"],
    ["service", "r.uuid = $2::uuid", "TRUE"],
    ["service", "equipmentUuid, requestUuid", "equipmentUuid, undefined"],
    ["manifest", 'path="/dispatch/equipment-transfers"', 'path="/dispatch/equipment-transfers-dead"'],
  ];
  const escaped = mutations.filter(([key, needle, replacement]) => {
    if (!files[key].includes(needle)) return true;
    return audit({ ...files, [key]: files[key].replace(needle, replacement) }).length === 0;
  });
  if (escaped.length) {
    console.error(`verify-fleet-trailer-transfer-record-reverse SELFTEST FAIL — ${escaped.length} planted defects escaped`);
    process.exit(1);
  }
  console.log(`verify-fleet-trailer-transfer-record-reverse SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`verify-fleet-trailer-transfer-record-reverse FAIL — ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify-fleet-trailer-transfer-record-reverse PASS — mounted trailer transfer rows drill to exact entity-scoped records");
