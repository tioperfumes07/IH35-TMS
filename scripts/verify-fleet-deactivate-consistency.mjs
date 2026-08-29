#!/usr/bin/env node
// Guard — vehicle/trailer status writes must keep deactivated_at consistent with status, so an
// archived (Sold/Transferred/Damaged/Lost) asset drops out of active lists and a reactivated one
// (InService/OutOfService/InMaintenance) reappears. This is the Saldana desync class (#1034): setting
// status without deactivated_at left sold assets lingering as active. Lock BOTH directions, BOTH the
// units PATCH and the trailer status PUT.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-fleet-deactivate-consistency: ${m}`); process.exit(1); };

function audit(units, trailer) {
  const checks = [
    ["units archive status stamps deactivated_at", /ARCHIVE_STATUSES\.has\(b\.status\)[\s\S]{0,160}deactivated_at/.test(units)],
    ["units active status clears deactivated_at", /ACTIVE_FLEET_STATUSES\.has\(b\.status\)[\s\S]{0,160}add\("deactivated_at",\s*null\)/.test(units)],
    ["trailer archive status stamps deactivated_at", /TRAILER_ARCHIVE_STATUSES[\s\S]{0,200}deactivated_at = COALESCE/.test(trailer)],
    ["trailer active status clears deactivated_at", /TRAILER_ACTIVE_STATUSES[\s\S]{0,120}deactivated_at = NULL/.test(trailer)],
  ];
  return checks.filter(([, passed]) => !passed).map(([label]) => label);
}

// UNITS — PATCH /api/v1/mdata/units/:id
const units = read("apps/backend/src/mdata/units.routes.ts");
const trailer = read("apps/backend/src/fleet/trailer.routes.ts");

if (process.argv.includes("--selftest")) {
  const fixtures = [
    [units.replace('add("deactivated_at", companyBusinessDate())', 'add("status_note", "archived")'), trailer],
    [units.replace('add("deactivated_at", null)', 'add("status_note", "active")'), trailer],
    [units, trailer.replace('deactivated_at = COALESCE($4::date, CURRENT_DATE)::timestamptz', 'status = status')],
    [units, trailer.replace('deactivated_at = NULL', 'status = status')],
  ];
  const escaped = fixtures.filter(([unitFixture, trailerFixture]) => audit(unitFixture, trailerFixture).length === 0);
  if (audit(units, trailer).length || escaped.length) {
    fail(`selftest expected 4 planted lifecycle defects; ${escaped.length} escaped`);
  }
  console.log("OK verify-fleet-deactivate-consistency --selftest: 4/4 status lifecycle defects detected.");
  process.exit(0);
}

const failures = audit(units, trailer);
if (failures.length) fail(failures.join("; "));

console.log("OK verify-fleet-deactivate-consistency: units + trailers keep deactivated_at consistent with status.");
