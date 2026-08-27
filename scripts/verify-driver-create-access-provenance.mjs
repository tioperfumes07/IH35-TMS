#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");

function failuresFor(source) {
  const checks = [
    ["create scopes requested company through accessible active company", /id IN \(SELECT org\.user_accessible_company_ids\(\)\)[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}is_active = true/.test(source)],
    ["create reuses canonical company access row", /INSERT INTO org\.user_company_access \(user_id, company_id, granted_by_user_id, deactivated_at, granted_at\)[\s\S]{0,180}ON CONFLICT \(user_id, company_id\)/.test(source)],
    ["active grant provenance is immutable", /ON CONFLICT \(user_id, company_id\)[\s\S]{0,260}WHERE org\.user_company_access\.deactivated_at IS NOT NULL/.test(source)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-driver-create-access-provenance: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replaceAll("id IN (SELECT org.user_accessible_company_ids())", "true"),
    source.replace("ON CONFLICT (user_id, company_id)", "ON CONFLICT DO NOTHING"),
    source.replace("WHERE org.user_company_access.deactivated_at IS NOT NULL", "WHERE true"),
  ];
  const missed = mutations.map((mutation, index) => ({ index, failures: failuresFor(mutation) })).filter((entry) => entry.failures.length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL verify-driver-create-access-provenance: missed ${missed.map((entry) => entry.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-driver-create-access-provenance: caught ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-driver-create-access-provenance: Create Driver inserts/reactivates access without rewriting active grant provenance.");
