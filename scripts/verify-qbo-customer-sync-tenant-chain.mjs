#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:qbo-customer-sync-tenant-chain — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

function read(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`missing file: ${relPath}`);
  }
  return fs.readFileSync(full, "utf8");
}

const failures = [];

let masterWrite = "";
let handler = "";
let pushService = "";
let syncRuns = "";

try {
  masterWrite = read("apps/backend/src/mdata/qbo-master-write.routes.ts");
  handler = read("apps/backend/src/outbox/handlers/qbo-master-entity-push.handler.ts");
  pushService = read("apps/backend/src/qbo/push.service.ts");
  syncRuns = read("apps/backend/src/qbo/master-data-sync.service.ts");
} catch (error) {
  fail([String(error instanceof Error ? error.message : error)]);
}

if (!masterWrite.includes("entity: \"customer\"")) {
  failures.push("apps/backend/src/mdata/qbo-master-write.routes.ts:1 missing customer master write enqueue path");
}
if (!masterWrite.includes("operating_company_id: body.operating_company_id")) {
  failures.push("apps/backend/src/mdata/qbo-master-write.routes.ts:1 enqueue payload must include operating_company_id");
}
if (!pushService.includes("qbo.master_entity.push_requested")) {
  failures.push("apps/backend/src/qbo/push.service.ts:1 missing qbo.master_entity.push_requested outbox event enqueue");
}
const payloadReadMarker = "const operating_company_id = requireUuid(payload.operating_company_id";
if (!handler.includes(payloadReadMarker)) {
  failures.push("apps/backend/src/outbox/handlers/qbo-master-entity-push.handler.ts:1 must read operating_company_id from payload");
}
const lookupMarker = "WHERE id = $1::uuid AND operating_company_id = $2::uuid";
if (!pushService.includes(lookupMarker)) {
  failures.push("apps/backend/src/qbo/push.service.ts:1 customer mirror lookup must enforce operating_company_id");
}
if (!syncRuns.includes("INSERT INTO mdata.qbo_sync_runs") || !syncRuns.includes("operating_company_id")) {
  failures.push("apps/backend/src/qbo/master-data-sync.service.ts:1 sync run writes must include operating_company_id");
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:qbo-customer-sync-tenant-chain — OK");
