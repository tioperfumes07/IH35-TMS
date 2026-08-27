#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/mdata/driver-app-access.service.ts");

function failuresFor(source) {
  const checks = [
    ["identity sync writes only on a real lifecycle/profile change", /UPDATE identity\.users[\s\S]{0,420}AND \(role IS DISTINCT FROM 'Driver'[\s\S]{0,260}RETURNING id::text AS id/.test(source)],
    ["active company grant provenance is preserved", /ON CONFLICT \(user_id, company_id\)[\s\S]{0,260}WHERE org\.user_company_access\.deactivated_at IS NOT NULL[\s\S]{0,80}RETURNING user_id::text/.test(source)],
    ["driver link is company scoped and active", /UPDATE mdata\.drivers[\s\S]{0,300}operating_company_id = \$3::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,80}RETURNING id::text/.test(source)],
    ["lost driver link aborts access provisioning", /driver\.identity_user_id !== identityUserId && !linkRes\.rows\[0\][\s\S]{0,420}driver_app_access_state_changed/.test(source)],
    ["lost driver link rolls back helper writes", /driver\.identity_user_id !== identityUserId && !linkRes\.rows\[0\][\s\S]{0,180}ROLLBACK TO SAVEPOINT driver_app_access_provision[\s\S]{0,180}driver_app_access_state_changed/.test(source)],
    ["access-granted audit requires a real mutation", /if \(createdUser \|\| identityRes\.rows\.length > 0 \|\| accessRes\.rows\.length > 0 \|\| linkRes\.rows\.length > 0\)[\s\S]{0,120}appendCrudAudit/.test(source)],
    ["audit discloses which access mutations occurred", /identity_updated_or_reactivated[\s\S]{0,180}company_access_inserted_or_reactivated[\s\S]{0,140}linked_driver/.test(source)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-driver-app-access-provenance: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("AND (role IS DISTINCT FROM 'Driver'", "AND (false"),
    source.replace("WHERE org.user_company_access.deactivated_at IS NOT NULL", "WHERE true"),
    source.replace("AND operating_company_id = $3::uuid", "AND true"),
    source.replace("AND deactivated_at IS NULL", "AND true"),
    source.replace("if (driver.identity_user_id !== identityUserId && !linkRes.rows[0])", "if (false)"),
    source.replace('await client.query("ROLLBACK TO SAVEPOINT driver_app_access_provision");', 'await client.query("SELECT 1");'),
    source.replace("if (createdUser || identityRes.rows.length > 0 || accessRes.rows.length > 0 || linkRes.rows.length > 0)", "if (true)"),
  ];
  const missed = mutations.map((mutation, index) => ({ index, failures: failuresFor(mutation) })).filter((entry) => entry.failures.length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL verify-driver-app-access-provenance: missed ${missed.map((entry) => entry.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-driver-app-access-provenance: caught ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-driver-app-access-provenance: invite bootstrap preserves active grant provenance and audits only real access mutations.");
