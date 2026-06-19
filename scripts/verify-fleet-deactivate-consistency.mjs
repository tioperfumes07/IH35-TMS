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

// UNITS — PATCH /api/v1/mdata/units/:id
const units = read("apps/backend/src/mdata/units.routes.ts");
if (!/ARCHIVE_STATUSES\.has\(b\.status\)[\s\S]{0,160}deactivated_at/.test(units))
  fail("units PATCH must set deactivated_at when status is an archive status");
if (!/ACTIVE_FLEET_STATUSES\.has\(b\.status\)[\s\S]{0,160}add\("deactivated_at",\s*null\)/.test(units))
  fail("units PATCH must CLEAR deactivated_at (reactivate) when status returns to an active-fleet status");

// TRAILERS / EQUIPMENT — PUT /api/v1/fleet/trailers/:id/status
const trailer = read("apps/backend/src/fleet/trailer.routes.ts");
if (!/TRAILER_ARCHIVE_STATUSES[\s\S]{0,200}deactivated_at = COALESCE/.test(trailer))
  fail("trailer status PUT must set deactivated_at when status is an archive status (was the Saldana-class gap)");
if (!/TRAILER_ACTIVE_STATUSES[\s\S]{0,120}deactivated_at = NULL/.test(trailer))
  fail("trailer status PUT must CLEAR deactivated_at (reactivate) when status returns to an active-fleet status");

console.log("OK verify-fleet-deactivate-consistency: units + trailers keep deactivated_at consistent with status.");
