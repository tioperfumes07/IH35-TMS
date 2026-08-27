#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/drivers/drivers-bulk.routes.ts";
const source = fs.readFileSync(file, "utf8");

const checks = [
  ["bulk_status_dca", "company_id = $5::uuid", "ctx.actorUserId, ctx.operatingCompanyId"],
  ["bulk_oos_dca", "company_id = $4::uuid", "ctx.actorUserId, ctx.operatingCompanyId"],
  ["bulk_archive_dca", "company_id = $3::uuid", "ctx.actorUserId, ctx.operatingCompanyId"],
];

function inspect(value) {
  const failures = [];
  for (const [alias, companyParam, values] of checks) {
    const start = value.indexOf(`SELECT 1 FROM mdata.driver_company_authorizations ${alias}`);
    if (start < 0) {
      failures.push(`missing ${alias} write predicate`);
      continue;
    }
    const window = value.slice(start, start + 520);
    for (const token of [companyParam, `${alias}.driver_id = mdata.drivers.id`, `${alias}.is_authorized = true`, `${alias}.deactivated_at IS NULL`]) {
      if (!window.includes(token)) failures.push(`${alias} missing ${token}`);
    }
    if (!value.includes(values)) failures.push(`${alias} query values omit submitted company`);
  }
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-driver-bulk-write-company-predicate FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [alias] of checks) {
    if (inspect(source.replace(`${alias}.is_authorized = true`, `${alias}.is_authorized = false`)).length === 0) {
      throw new Error(`selftest missed ${alias}`);
    }
  }
  console.log(`verify-driver-bulk-write-company-predicate --selftest PASS (${checks.length}/${checks.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-driver-bulk-write-company-predicate PASS — status/OOS/archive writes reassert canonical company authorization atomically");
