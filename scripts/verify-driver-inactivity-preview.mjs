#!/usr/bin/env node
/**
 * Driver-inactivity guard: the 21-day inactivity sweep block is READ/PREVIEW ONLY.
 * Deactivating drivers (status='Inactive' + deactivated_at) is a Tier-1 mass status write that STOPS for Jorge —
 * so this block must NEVER write. Fails CI if the preview service/route contains any mutation or sets
 * status/deactivated_at.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const failures = [];
const read = (p) => {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${p}`); return ""; }
  return fs.readFileSync(abs, "utf8");
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");

const SVC = "apps/backend/src/mdata/driver-inactivity-preview.service.ts";
const ROUTE = "apps/backend/src/mdata/driver-inactivity-preview.routes.ts";
const svc = read(SVC);
const route = read(ROUTE);

for (const [file, src] of [[SVC, svc], [ROUTE, route]]) {
  if (!src) continue;
  const code = stripComments(src);
  if (/\b(INSERT\s+INTO|UPDATE\s+mdata\.drivers|UPDATE\s+"?\w|DELETE\s+FROM)\b/i.test(code)) {
    failures.push(`${file}: contains a data mutation — the inactivity sweep preview must be READ-ONLY (deactivation is Jorge-gated, separate).`);
  }
  if (/SET\s+(status|deactivated_at)\b/i.test(code)) {
    failures.push(`${file}: sets status/deactivated_at — deactivation is a separate Jorge-approved step, not this block.`);
  }
}

if (svc) {
  if (!/previewDriverInactivity/.test(svc)) failures.push(`${SVC}: must export previewDriverInactivity`);
  if (!/identity\.users/.test(svc) || !/last_login_at/.test(svc)) failures.push(`${SVC}: must read login from identity.users.last_login_at (joined via identity_user_id)`);
  if (!/OVER_21|NEVER_LOGGED_IN|NO_LOGIN_ACCOUNT/.test(svc)) failures.push(`${SVC}: must bucket OVER_21 / UNDER_21 / NEVER_LOGGED_IN / NO_LOGIN_ACCOUNT`);
  // The DRIVING-based sweep (Jorge's real rule) must read vehicle_driver_assignments + bucket + carry a coverage guard.
  if (!/previewDriverDrivingInactivity/.test(svc)) failures.push(`${SVC}: must export previewDriverDrivingInactivity (the driving-based sweep)`);
  if (!/vehicle_driver_assignments/.test(svc)) failures.push(`${SVC}: driving sweep must read telematics.vehicle_driver_assignments (last_drove_at), not login`);
  if (!/CURRENTLY_DRIVING|OVER_21_DAYS|NEVER_ON_RECORD/.test(svc)) failures.push(`${SVC}: must bucket CURRENTLY_DRIVING / DROVE_WITHIN_21 / OVER_21_DAYS / NEVER_ON_RECORD`);
  if (!/coverage/.test(svc) || !/trustworthy/.test(svc)) failures.push(`${SVC}: driving sweep must carry a coverage guard (earliest history + trustworthy flag)`);
}
if (route) {
  if (!/\.get\(/.test(route) || /\.(post|put|patch|delete)\(/i.test(route)) {
    failures.push(`${ROUTE}: must expose a GET preview only — no write verb endpoint.`);
  }
}

if (failures.length) {
  console.error("verify:driver-inactivity-preview FAIL:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("verify:driver-inactivity-preview OK");
