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
  if (!/UPDATE mdata\.units[\s\S]*SET assigned_driver_id = NULL[\s\S]*assigned_driver_id = \$1::uuid[\s\S]*owner_company_id = \$3::uuid OR currently_leased_to_company_id = \$3::uuid[\s\S]*RETURNING id::text/.test(writer)) failures.push("prior unit mirrors must be cleared in company scope with identity evidence");
  if (!/UPDATE mdata\.units[\s\S]*SET assigned_driver_id = \$2::uuid[\s\S]*id = \$1::uuid[\s\S]*owner_company_id = \$3::uuid OR currently_leased_to_company_id = \$3::uuid[\s\S]*RETURNING id::text/.test(writer)) failures.push("selected unit mirror must be persisted in company scope");
  if (!/if \(!\(unitMirror\.rows\[0\][\s\S]*\?\.id\)[\s\S]*throw new Error\("driver_bulk_unit_mirror_write_failed"\)/.test(writer)) failures.push("selected unit mirror identity must be required");
  if (!/INSERT INTO telematics\.vehicle_driver_assignments[\s\S]*RETURNING id::text/.test(writer)) failures.push("canonical assignment insert must return identity");
  if (!/if \(!\(inserted\.rows\[0\][\s\S]*\?\.id\)[\s\S]*throw new Error\("driver_bulk_assignment_write_failed"\)/.test(writer)) failures.push("canonical assignment identity must be required before audit/success");
  return failures;
}

function mutateAssignWriter(src, before, after) {
  const start = src.indexOf("async function handleAssignTruck");
  const end = src.indexOf("export async function registerDriversBulkRoutes", start);
  if (start < 0 || end <= start) return src;
  const writer = src.slice(start, end);
  const mutatedWriter = writer.replace(before, after);
  if (mutatedWriter === writer) return src;
  return `${src.slice(0, start)}${mutatedWriter}${src.slice(end)}`;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    // DRIVER-F7354 — archive now has a sibling driver-default lock earlier in
    // this file. Mutate the Assign Truck writer itself so this arm can never
    // accidentally edit the sibling and leave the protected site untouched.
    mutateAssignWriter(source, "driver-default:${ctx.operatingCompanyId}:${ctx.id}", "driver-default:${ctx.id}"),
    mutateAssignWriter(source, "unit-default:${ctx.operatingCompanyId}:${unitId}", "unit-default:${unitId}"),
    mutateAssignWriter(source, "].sort();", "];"),
    mutateAssignWriter(source, "pg_advisory_xact_lock", "pg_advisory_lock"),
    mutateAssignWriter(source, "SET assigned_driver_id = NULL,", "SET updated_at = now(),"),
    mutateAssignWriter(source, "SET assigned_driver_id = $2::uuid,", "SET assigned_driver_id = NULL,"),
    mutateAssignWriter(source, 'throw new Error("driver_bulk_unit_mirror_write_failed");', "return { ok: true };"),
    mutateAssignWriter(source, "'bulk_assign', true, $4)\n        RETURNING id::text", "'bulk_assign', true, $4)\n        RETURNING unit_id::text"),
    mutateAssignWriter(source, 'throw new Error("driver_bulk_assignment_write_failed");', "return { ok: true };"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  });
  console.log("verify-driver-bulk-assignment-atomic SELFTEST PASS (9/9)");
}

const failures = verify();
if (failures.length) {
  console.error("verify-driver-bulk-assignment-atomic FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("verify-driver-bulk-assignment-atomic PASS");
