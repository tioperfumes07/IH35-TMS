#!/usr/bin/env node
/**
 * Driver-inactivity guard: the preview block is READ/PREVIEW ONLY.
 * Mass Inactive writes live in DRV-ACTIVE-30D (migration + driver-active-30d.service) — NOT here.
 * Fails CI if the preview service/route contains any mutation or sets status/deactivated_at.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const readFailures = [];
const read = (p) => {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { readFailures.push(`MISSING: ${p}`); return ""; }
  return fs.readFileSync(abs, "utf8");
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");

const SVC = "apps/backend/src/mdata/driver-inactivity-preview.service.ts";
const ROUTE = "apps/backend/src/mdata/driver-inactivity-preview.routes.ts";
const svc = read(SVC);
const route = read(ROUTE);

function evaluate(svcSource, routeSource) {
const failures = [...readFailures];
for (const [file, src] of [[SVC, svcSource], [ROUTE, routeSource]]) {
  if (!src) continue;
  const code = stripComments(src);
  if (/\b(INSERT\s+INTO|UPDATE\s+mdata\.drivers|UPDATE\s+"?\w|DELETE\s+FROM)\b/i.test(code)) {
    failures.push(`${file}: contains a data mutation — the inactivity sweep preview must be READ-ONLY (deactivation is Jorge-gated, separate).`);
  }
  if (/SET\s+(status|deactivated_at)\b/i.test(code)) {
    failures.push(`${file}: sets status/deactivated_at — deactivation is a separate Jorge-approved step, not this block.`);
  }
}

if (svcSource) {
  if (!/previewDriverInactivity/.test(svcSource)) failures.push(`${SVC}: must export previewDriverInactivity`);
  if (!/identity\.users/.test(svcSource) || !/last_login_at/.test(svcSource)) failures.push(`${SVC}: must read login from identity.users.last_login_at (joined via identity_user_id)`);
  if (!/OVER_21|NEVER_LOGGED_IN|NO_LOGIN_ACCOUNT/.test(svcSource)) failures.push(`${SVC}: must bucket OVER_21 / UNDER_21 / NEVER_LOGGED_IN / NO_LOGIN_ACCOUNT`);
  // The DRIVING-based sweep (Jorge's real rule) must read vehicle_driver_assignments + bucket + carry a coverage guard.
  if (!/previewDriverDrivingInactivity/.test(svcSource)) failures.push(`${SVC}: must export previewDriverDrivingInactivity (the driving-based sweep)`);
  if (!/vehicle_driver_assignments/.test(svcSource)) failures.push(`${SVC}: driving sweep must read telematics.vehicle_driver_assignments (last_drove_at), not login`);
  if (!/CURRENTLY_DRIVING|OVER_21_DAYS|NEVER_ON_RECORD/.test(svcSource)) failures.push(`${SVC}: must bucket CURRENTLY_DRIVING / DROVE_WITHIN_21 / OVER_21_DAYS / NEVER_ON_RECORD`);
  if (!/coverage/.test(svcSource) || !/trustworthy/.test(svcSource)) failures.push(`${SVC}: driving sweep must carry a coverage guard (earliest history + trustworthy flag)`);
  if (!/login_preview_dca\.driver_id = d\.id[\s\S]{0,180}login_preview_dca\.company_id = \$1::uuid[\s\S]{0,180}login_preview_dca\.is_authorized = true[\s\S]{0,120}login_preview_dca\.deactivated_at IS NULL/.test(svcSource)) failures.push(`${SVC}: login preview must include active company-authorized shared drivers`);
  if (!/driving_preview_dca\.driver_id = d\.id[\s\S]{0,180}driving_preview_dca\.company_id = \$1::uuid[\s\S]{0,180}driving_preview_dca\.is_authorized = true[\s\S]{0,120}driving_preview_dca\.deactivated_at IS NULL/.test(svcSource)) failures.push(`${SVC}: driving preview must include active company-authorized shared drivers`);
}
if (routeSource) {
  if (!/\.get\(/.test(routeSource) || /\.(post|put|patch|delete)\(/i.test(routeSource)) {
    failures.push(`${ROUTE}: must expose a GET preview only — no write verb endpoint.`);
  }
  const scopedCalls = routeSource.match(/await setScopedCompanyContext\(client, user\.uuid, oc\);/g) ?? [];
  if (scopedCalls.length !== 2) failures.push(`${ROUTE}: both preview GETs must membership-scope the selected company (found ${scopedCalls.length}/2)`);
  const forbiddenMappings = routeSource.match(/\(error as Error\)\.message === "forbidden_company_membership"[\s\S]{0,120}reply\.code\(403\)/g) ?? [];
  if (forbiddenMappings.length !== 2) failures.push(`${ROUTE}: both preview GETs must map membership denial to 403 (found ${forbiddenMappings.length}/2)`);
  if (/client\.query\("SELECT set_config\('app\.operating_company_id'/.test(routeSource)) {
    failures.push(`${ROUTE}: must not set a caller-selected company GUC without membership validation`);
  }
}
return failures;
}

if (process.argv.includes("--selftest")) {
  const liveFailures = evaluate(svc, route);
  if (liveFailures.length) {
    console.error("verify:driver-inactivity-preview SELFTEST FAIL live:\n - " + liveFailures.join("\n - "));
    process.exit(1);
  }
  const mutations = [
    route.replace("await setScopedCompanyContext(client, user.uuid, oc);", "await client.query(\"SELECT set_config('app.operating_company_id', $1::text, true)\", [oc]);"),
    route.replace("await setScopedCompanyContext(client, user.uuid, oc);", "await setScopedCompanyContext(client, user.uuid, oc);").replace(/await setScopedCompanyContext\(client, user\.uuid, oc\);/g, (match, offset) => offset === route.lastIndexOf(match) ? "await client.query(\"SELECT set_config('app.operating_company_id', $1::text, true)\", [oc]);" : match),
    route.replace('if ((error as Error).message === "forbidden_company_membership") {', 'if ((error as Error).message === "wrong_error") {'),
  ];
  mutations.forEach((mutated, index) => {
    if (mutated === route || evaluate(svc, mutated).length === 0) {
      console.error(`verify:driver-inactivity-preview SELFTEST FAIL — mutation ${index + 1} stayed green`);
      process.exit(1);
    }
  });
  const serviceMutations = [
    svc.replace("login_preview_dca.is_authorized = true", "login_preview_dca.is_authorized = false"),
    svc.replace("driving_preview_dca.is_authorized = true", "driving_preview_dca.is_authorized = false"),
  ];
  serviceMutations.forEach((mutated, index) => {
    if (mutated === svc || evaluate(mutated, route).length === 0) {
      console.error(`verify:driver-inactivity-preview SELFTEST FAIL — shared-driver mutation ${index + 1} stayed green`);
      process.exit(1);
    }
  });
  console.log("verify:driver-inactivity-preview SELFTEST PASS — 5/5 planted defects rejected");
  process.exit(0);
}

const failures = evaluate(svc, route);

if (failures.length) {
  console.error("verify:driver-inactivity-preview FAIL:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("verify:driver-inactivity-preview OK");
