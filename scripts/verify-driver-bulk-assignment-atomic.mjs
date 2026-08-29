#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = "apps/backend/src/drivers/drivers-bulk.routes.ts";
const source = readFileSync(file, "utf8");

function verify(src = source) {
  const failures = [];
  const start = src.indexOf("async function handleAssignTruck");
  const end = src.indexOf("export async function registerDriversBulkRoutes", start);
  const writer = start >= 0 && end > start ? src.slice(start, end) : "";
  if (!/driver-default:\$\{ctx\.operatingCompanyId\}:\$\{ctx\.id\}/.test(writer)) failures.push("driver lifecycle lock key missing");
  if (!/unit-default:\$\{ctx\.operatingCompanyId\}:\$\{unitId\}/.test(writer)) failures.push("unit lifecycle lock key missing");
  if (!/assignmentLockKeys[\s\S]*\.sort\(\)/.test(writer)) failures.push("assignment locks must have deterministic order");
  if (!/pg_advisory_xact_lock\(hashtextextended\(\$1::text, 0\)\)/.test(writer)) failures.push("transaction-scoped assignment lock missing");
  if (!/INSERT INTO telematics\.vehicle_driver_assignments[\s\S]*RETURNING id::text/.test(writer)) failures.push("canonical assignment insert must return identity");
  if (!/if \(!\(inserted\.rows\[0\][\s\S]*\?\.id\)[\s\S]*throw new Error\("driver_bulk_assignment_write_failed"\)/.test(writer)) failures.push("canonical assignment identity must be required before audit/success");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("driver-default:${ctx.operatingCompanyId}:${ctx.id}", "driver-default:${ctx.id}"),
    source.replace("unit-default:${ctx.operatingCompanyId}:${unitId}", "unit-default:${unitId}"),
    source.replace("].sort();", "];"),
    source.replace("pg_advisory_xact_lock", "pg_advisory_lock"),
    source.replace("RETURNING id::text", "RETURNING unit_id::text"),
    source.replace('throw new Error("driver_bulk_assignment_write_failed");', "return { ok: true };"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  });
  console.log("verify-driver-bulk-assignment-atomic SELFTEST PASS (6/6)");
}

const failures = verify();
if (failures.length) {
  console.error("verify-driver-bulk-assignment-atomic FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("verify-driver-bulk-assignment-atomic PASS");
