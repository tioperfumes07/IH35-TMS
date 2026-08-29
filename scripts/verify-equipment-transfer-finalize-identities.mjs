#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/backend/src/mdata/equipment-transfer.service.ts";
function inspect(s) {
  const f=[];
  const count = (pattern) => [...s.matchAll(pattern)].length;
  const checks=[
    ["log identity",/if \(!equipmentLogId\) throw new Error\("E_EQUIPMENT_TRANSFER_LOG_INSERT_FAILED"\)/g,1],
    ["transfer scoped CAS",/operating_company_id = \$2::uuid[\s\S]{0,80}status = 'pending_to_confirm'[\s\S]{0,80}RETURNING id::text AS id/g,3],
    ["transfer result",/if \(!confirmed\.rows\[0\]\?\.id\) throw new Error\("E_EQUIPMENT_TRANSFER_CONFIRM_FAILED"\)/g,2],
    ["equipment ownership",/owner_company_id = \$3::uuid OR currently_leased_to_company_id = \$3::uuid/g,2],
    ["equipment result",/if \(!assigned\.rows\[0\]\?\.id\) throw new Error\("E_EQUIPMENT_TRANSFER_ASSIGN_FAILED"\)/g,2],
  ]; for(const [l,p,n] of checks) if(count(p)!==n) f.push(`${l} (${count(p)}/${n})`);
  if(count(/return withCurrentUser\(userId, async \(client\) =>/g)<4) f.push("wrapper transaction coverage");
  if(/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(s)) f.push("nested transaction control remains");
  if(/equipment_log_id: equipmentLogId \|\| undefined/.test(s)) f.push("optional log audit remains");
  return f;
}
const s=fs.readFileSync(FILE,"utf8");
if(process.argv.includes("--selftest")){const ms=[
  s.replace('if (!equipmentLogId) throw new Error("E_EQUIPMENT_TRANSFER_LOG_INSERT_FAILED");','// planted'),
  s.replace(" AND operating_company_id = $2::uuid AND status = 'pending_to_confirm'",""),
  s.replace('if (!confirmed.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_CONFIRM_FAILED");','// planted'),
  s.replace("AND (owner_company_id = $3::uuid OR currently_leased_to_company_id = $3::uuid)",""),
  s.replace('if (!assigned.rows[0]?.id) throw new Error("E_EQUIPMENT_TRANSFER_ASSIGN_FAILED");','// planted'),
  s.replace("equipment_log_id: equipmentLogId,","equipment_log_id: equipmentLogId || undefined,"),
  s.replace("await setScopedCompanyContext(client, userId, input.operating_company_id);", 'await setScopedCompanyContext(client, userId, input.operating_company_id);\n    await client.query("COMMIT");'),
];const survived=ms.filter(x=>inspect(x).length===0);if(survived.length){console.error(`FAIL verify-equipment-transfer-finalize-identities --selftest: ${survived.length}/${ms.length} survived`);process.exit(1)}console.log(`PASS verify-equipment-transfer-finalize-identities --selftest (${ms.length} mutations killed)`);process.exit(0)}
const f=inspect(s);if(f.length){console.error(`FAIL verify-equipment-transfer-finalize-identities: ${f.join("; ")}`);process.exit(1)}console.log("PASS verify-equipment-transfer-finalize-identities");
