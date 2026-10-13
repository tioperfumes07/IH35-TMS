#!/usr/bin/env node
/**
 * LEAD 443.113 AJK-04 — ensureDriverVendor must never report success for a driver it did not link. The rule:
 *   - ensure-driver-vendor.shared.ts: a same-name vendor is linked (driver_id set, only in a company with
 *     enforce_line_categorization — TRANSP / TRK are frozen QBO mirrors) or refused with DriverVendorIdentityUnresolvedError;
 *     it is never answered with a bare `return "already_present"`. The 23505 race path re-reads the vendor by driver_id
 *     before calling it present.
 *   - vendors.routes.ts (ensure-drivers): a refusal is reported per driver by name, and not every non-created/linked
 *     outcome is counted as already present.
 * --selftest plants each violation into a copy of the real sources (no database).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-ensure-driver-vendor-links-or-refuses";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = "apps/backend/src/mdata/ensure-driver-vendor.shared.ts";
const ROUTES = "apps/backend/src/mdata/vendors.routes.ts";

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** The rule, pure: the errors for the shared module + the ensure-drivers route source texts. */
export function sourceErrors(shared, routes) {
  const errors = [];
  if (/nameMatch\.rows\[0\]\?\.id\)\s*return\s+"already_present"/.test(shared)) {
    errors.push(`${SHARED} answers a same-name vendor with "already_present" without linking driver_id (AJK-04 silent success)`);
  }
  if (/!==\s*"23505"\)\s*throw err;\s*return\s+"already_present"/.test(shared)) {
    errors.push(`${SHARED} counts every 23505 collision as already present without re-reading the vendor by driver_id`);
  }
  if (!/export class DriverVendorIdentityUnresolvedError/.test(shared)) {
    errors.push(`${SHARED} must export DriverVendorIdentityUnresolvedError (the refusal that names the vendor)`);
  }
  if (!/enforce_line_categorization/.test(shared)) {
    errors.push(`${SHARED} must refuse to link in a frozen QBO-mirror company (org.companies.enforce_line_categorization)`);
  }
  if (!/SET driver_id = \$3::uuid[\s\S]{0,400}AND driver_id IS NULL/.test(shared)) {
    errors.push(`${SHARED} must link the same-name vendor by setting driver_id, only while it is still unlinked`);
  }
  if (!/DriverVendorIdentityUnresolvedError/.test(routes)) {
    errors.push(`${ROUTES} ensure-drivers must catch DriverVendorIdentityUnresolvedError and report the vendor by name`);
  }
  if (/else\s+alreadyPresent\s*\+=\s*1;/.test(routes)) {
    errors.push(`${ROUTES} counts every non-created/linked outcome as already present`);
  }
  return errors;
}

function liveCheck() {
  const errors = sourceErrors(read(SHARED), read(ROUTES));
  if (errors.length) {
    console.error(`${LABEL} FAILED:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — a same-name vendor is linked or refused by name, never a silent success`);
}

function selftest() {
  const shared = read(SHARED);
  const routes = read(ROUTES);
  const ok = (s, r) => sourceErrors(s, r).length === 0;
  const raceRecheck = /if \(raced\.rows\[0\]\?\.id\) return "already_present";\s*throw new DriverVendorIdentityUnresolvedError\([^)]*\);/;
  const cases = [
    ["the real sources pass", ok(shared, routes)],
    ["the race re-check fixture is present", raceRecheck.test(shared)],
    [
      "the old name-match shape fails",
      !ok(shared.replace(/if \(nameMatch\.rows\.length > 0\) \{[\s\S]*?\n {2}\}/, 'if (nameMatch.rows[0]?.id) return "already_present";'), routes),
    ],
    [
      "a 23505 path that returns already_present unchecked fails",
      !ok(shared.replace(/if \(\(err as \{ code\?: string \}\)\?\.code !== "23505"\) throw err;[\s\S]*?throw new DriverVendorIdentityUnresolvedError\([^)]*\);/, 'if ((err as { code?: string })?.code !== "23505") throw err;\n    return "already_present";'), routes),
    ],
    ["a module without the refusal class fails", !ok(shared.replace("export class DriverVendorIdentityUnresolvedError", "class Gone"), routes)],
    ["linking without the frozen-company check fails", !ok(shared.split("enforce_line_categorization").join("x"), routes)],
    ["a link that does not set driver_id fails", !ok(shared.split("SET driver_id = $3::uuid").join("SET vendor_type = 'Driver'"), routes)],
    ["a route that does not catch the refusal fails", !ok(shared, routes.split("DriverVendorIdentityUnresolvedError").join("Error"))],
    [
      "a route that counts every other outcome as present fails",
      !ok(shared, routes.replace('else if (outcome === "already_present") alreadyPresent += 1;', "else alreadyPresent += 1;")),
    ],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else liveCheck();
}
