#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/drivers/messages.service.ts";
const source = fs.readFileSync(file, "utf8");
const predicate = "WHERE id = $1 AND operating_company_id = $2::uuid AND driver_id = $3::uuid";
const values = "[input.messageId, input.operatingCompanyId, input.driverId]";

function inspect(value) {
  const failures = [];
  const writes = value.match(/UPDATE mdata\.driver_profile_messages[\s\S]{0,180}?delivery_status[\s\S]{0,220}?\]/g) ?? [];
  if (writes.length !== 4) failures.push(`expected 4 delivery status writes, found ${writes.length}`);
  for (const [index, write] of writes.entries()) {
    if (!write.includes(predicate)) failures.push(`delivery write ${index + 1} omits company/driver predicate`);
    if (!write.includes(values)) failures.push(`delivery write ${index + 1} omits company/driver values`);
  }
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-driver-message-delivery-write-scope FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const occurrences = [...source.matchAll(new RegExp(predicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
  for (const match of occurrences) {
    const mutant = `${source.slice(0, match.index)}WHERE id = $1${source.slice(match.index + predicate.length)}`;
    if (inspect(mutant).length === 0) throw new Error(`selftest missed write at ${match.index}`);
  }
  console.log(`verify-driver-message-delivery-write-scope --selftest PASS (${occurrences.length}/${occurrences.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-driver-message-delivery-write-scope PASS — delivered/failed writes bind message, company, and driver atomically");
