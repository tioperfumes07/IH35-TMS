#!/usr/bin/env node
import { readFileSync } from "node:fs";

const service = readFileSync("apps/backend/src/mdata/equipment-transfer.service.ts", "utf8");
const routes = readFileSync("apps/backend/src/mdata/equipment-transfer.routes.ts", "utf8");

function verify(s = service, r = routes) {
  const failures = [];
  const helperStart = s.indexOf("async function writeDualAckNotes");
  const helperEnd = s.indexOf("/** Append mdata.equipment_log", helperStart);
  const helper = helperStart >= 0 && helperEnd > helperStart ? s.slice(helperStart, helperEnd) : "";
  if (!/operating_company_id = \$2::uuid[\s\S]*status = 'pending_to_confirm'[\s\S]*COALESCE\(notes, ''\) = \$3[\s\S]*RETURNING id::text AS id/.test(helper)) failures.push("dual-ack writer must CAS transfer+company+pending status+prior notes and return identity");
  if (!/if \(!updated\.rows\[0\]\?\.id\) throw new Error\("E_TRANSFER_ACK_WRITE_CONFLICT"\)/.test(helper)) failures.push("dual-ack writer must fail on lost persistence");
  const calls = s.match(/await writeDualAckNotes\(client, \{/g) ?? [];
  if (calls.length !== 2) failures.push(`both acknowledgment paths must use the shared CAS writer (found ${calls.length})`);
  if (!/E_TRANSFER_ACK_WRITE_CONFLICT/.test(r)) failures.push("mounted routes must expose the acknowledgment conflict");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    service.replace("AND operating_company_id = $2::uuid\n        AND status = 'pending_to_confirm'", "AND true\n        AND status = 'pending_to_confirm'"),
    service.replace("AND status = 'pending_to_confirm'\n        AND COALESCE(notes, '') = $3", "AND status IS NOT NULL\n        AND COALESCE(notes, '') = $3"),
    service.replace("AND COALESCE(notes, '') = $3\n      RETURNING id::text AS id", "AND true\n      RETURNING id::text AS id"),
    service.replace('if (!updated.rows[0]?.id) throw new Error("E_TRANSFER_ACK_WRITE_CONFLICT");', "if (false) throw new Error();"),
    service.replace(/await writeDualAckNotes\(client, \{/, "await client.query(`SELECT 1`); // planted\n      await writeDualAckNotes(client, {")
      .replace(/await writeDualAckNotes\(client, \{/g, "await client.query(`SELECT 1`); // planted"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === service || verify(mutation, routes).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  }
  console.log(`[verify-fleet-transfer-ack-write-cas] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

const failures = verify();
if (failures.length) {
  console.error("[verify-fleet-transfer-ack-write-cas] FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("[verify-fleet-transfer-ack-write-cas] PASS");
