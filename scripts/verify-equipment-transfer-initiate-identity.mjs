#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/backend/src/mdata/equipment-transfer.service.ts";
function inspect(source) {
  const failures = [];
  const checks = [
    ["canonical identity required", /const createdTransfer = transfer\.rows\[0\];\s*if \(!createdTransfer\?\.id\) throw new Error\("E_EQUIPMENT_TRANSFER_INSERT_FAILED"\);/],
    ["audit uses proven identity", /resource_id: createdTransfer\.id,/],
    ["response uses proven identity", /return enrichTransferRow\(\{\s*id: createdTransfer\.id,/],
    ["expiry uses proven row", /expires_at: createdTransfer\.expires_at,/],
  ];
  for (const [label, pattern] of checks) if (!pattern.test(source)) failures.push(label);
  if (/resource_id: transfer\.rows\[0\]\?\.id/.test(source)) failures.push("optional audit identity remains");
  return failures;
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('if (!createdTransfer?.id) throw new Error("E_EQUIPMENT_TRANSFER_INSERT_FAILED");', "// planted"),
    source.replace("resource_id: createdTransfer.id,", "resource_id: transfer.rows[0]?.id,"),
    source.replace("id: createdTransfer.id,", "id: transfer.rows[0]?.id,"),
    source.replace("expires_at: createdTransfer.expires_at,", "expires_at: transfer.rows[0]?.expires_at,"),
  ];
  const survived = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (survived.length) { console.error(`FAIL verify-equipment-transfer-initiate-identity --selftest: ${survived.length}/${mutations.length} survived`); process.exit(1); }
  console.log(`PASS verify-equipment-transfer-initiate-identity --selftest (${mutations.length} mutations killed)`); process.exit(0);
}
const failures = inspect(source);
if (failures.length) { console.error(`FAIL verify-equipment-transfer-initiate-identity: ${failures.join("; ")}`); process.exit(1); }
console.log("PASS verify-equipment-transfer-initiate-identity");
