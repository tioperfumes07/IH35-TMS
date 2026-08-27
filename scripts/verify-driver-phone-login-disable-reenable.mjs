#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");
const FRONTEND = path.join(ROOT, "apps/frontend/src/pages/DriverDetail.tsx");
const TYPES = path.join(ROOT, "apps/frontend/src/types/api.ts");

function failuresFor(backend, frontend, types) {
  const enable = backend.match(/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/enable-phone-login"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const disable = backend.match(/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/disable-phone-login"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const checks = [
    ["detail exposes active account state", /AS phone_login_enabled/.test(backend) && /phone_login_enabled\?: boolean/.test(types)],
    ["UI renders active state rather than FK presence", /const hasPhoneLogin = driver\.phone_login_enabled \?\? Boolean\(driver\.identity_user_id\)/.test(frontend)],
    ["enable reads linked identity lifecycle", /iu\.deactivated_at AS identity_user_deactivated_at/.test(enable) && /LEFT JOIN identity\.users iu ON iu\.id = d\.identity_user_id/.test(enable)],
    ["enable reactivates the retained identity", /UPDATE identity\.users[\s\S]{0,100}SET deactivated_at = NULL[\s\S]{0,140}deactivated_at IS NOT NULL[\s\S]{0,80}RETURNING id/.test(enable)],
    ["reactivation is audited", /identity\.users\.reactivated[\s\S]{0,240}linked_driver_id/.test(enable)],
    ["lost reactivation is a 409", /if \(!reactivated\.rows\[0\]\) return \{ error: "driver_phone_login_state_changed" as const \};/.test(enable) && /driver_phone_login_state_changed[\s\S]{0,100}reply\.code\(409\)/.test(enable)],
    ["lost new-account link rolls back identity creation", /ROLLBACK TO SAVEPOINT driver_phone_login_enable[\s\S]{0,180}driver_phone_login_state_changed/.test(enable)],
    ["repeated disable is rejected before audit", /if \(!changed\) return \{ error: "driver_phone_login_already_disabled" as const \};[\s\S]{0,80}appendCrudAudit/.test(disable)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const backend = fs.readFileSync(BACKEND, "utf8");
const frontend = fs.readFileSync(FRONTEND, "utf8");
const types = fs.readFileSync(TYPES, "utf8");
const failures = failuresFor(backend, frontend, types);
if (failures.length) {
  console.error(`FAIL verify-driver-phone-login-disable-reenable: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("AS phone_login_enabled", "AS linked_only"), frontend, types],
    [backend, frontend.replace("driver.phone_login_enabled ?? Boolean(driver.identity_user_id)", "Boolean(driver.identity_user_id)"), types],
    [backend.replace("LEFT JOIN identity.users iu ON iu.id = d.identity_user_id", "LEFT JOIN identity.users iu ON false"), frontend, types],
    [backend.replaceAll("SET deactivated_at = NULL", "SET deactivated_at = deactivated_at"), frontend, types],
    [backend.replace('"identity.users.reactivated"', '"identity.users.updated"'), frontend, types],
    [backend.replace('if (!reactivated.rows[0]) return { error: "driver_phone_login_state_changed" as const };', "void reactivated;"), frontend, types],
    [backend.replace('await client.query("ROLLBACK TO SAVEPOINT driver_phone_login_enable");', 'await client.query("SELECT 1");'), frontend, types],
    [backend.replace('if (!changed) return { error: "driver_phone_login_already_disabled" as const };', "void changed;"), frontend, types],
  ];
  const missed = mutations.map(([b, f, t], index) => ({ index, failures: failuresFor(b, f, t) })).filter((entry) => entry.failures.length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL verify-driver-phone-login-disable-reenable: missed ${missed.map((entry) => entry.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-driver-phone-login-disable-reenable: caught ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-driver-phone-login-disable-reenable: retained identity links render true activity and support audited disable/reactivate transitions.");
