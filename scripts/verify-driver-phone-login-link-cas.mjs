#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");
const source = fs.readFileSync(FILE, "utf8");

function failuresFor(text) {
  const route = text.match(/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/enable-phone-login"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const checks = [
    ["pre-read selects company and active driver", /SELECT d\.id, d\.operating_company_id, d\.phone, d\.email, d\.identity_user_id[\s\S]{0,420}d\.deactivated_at IS NULL/.test(route)],
    ["link update is company scoped", /UPDATE mdata\.drivers[\s\S]{0,260}operating_company_id = \$4::uuid/.test(route)],
    ["link update is unlinked active CAS", /identity_user_id IS NULL[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}RETURNING id/.test(route)],
    ["lost link rolls back then returns state error before audit", /if \(!linked\.rows\[0\]\) \{[\s\S]{0,140}ROLLBACK TO SAVEPOINT driver_phone_login_enable[\s\S]{0,180}driver_phone_login_state_changed[\s\S]{0,180}appendCrudAudit/.test(route)],
    ["state error maps to HTTP 409", /updated\.error === "driver_phone_login_state_changed"[\s\S]{0,100}reply\.code\(409\)/.test(route)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-driver-phone-login-link-cas: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("SELECT d.id, d.operating_company_id, d.phone, d.email, d.identity_user_id", "SELECT d.id, d.phone, d.email, d.identity_user_id"),
    source.replace("AND operating_company_id = $4::uuid", "AND true"),
    source.replace("AND identity_user_id IS NULL", "AND true"),
    source.replace("AND identity_user_id IS NULL\n              AND deactivated_at IS NULL", "AND identity_user_id IS NULL\n              AND true"),
    source.replace('await client.query("ROLLBACK TO SAVEPOINT driver_phone_login_enable");', 'await client.query("SELECT 1");'),
    source.replace('updated.error === "driver_phone_login_state_changed"', 'updated.error === "lost"'),
  ];
  const missed = mutations.map((mutation, index) => ({ index, failures: failuresFor(mutation) })).filter((entry) => entry.failures.length === 0);
  const caught = mutations.length - missed.length;
  if (caught !== mutations.length) {
    console.error(`SELFTEST FAIL verify-driver-phone-login-link-cas: caught ${caught}/${mutations.length}; missed ${missed.map((entry) => entry.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-driver-phone-login-link-cas: caught ${caught}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-driver-phone-login-link-cas: identity creation links through an active company-scoped CAS or rolls back.");
