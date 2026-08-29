#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","reverse_link"],"leaves":["queues.trip_pairing"],"task":"DRV-F6207-TRIP-PAIRING-SHARED-DRIVER-LABEL","vertical":"column-wave"} */
/**
 * FAIL-TP1 — the Trip Pairing board must resolve its driver from the LOAD, not only from telematics.
 *
 * The board originally derived the driver solely from `telematics.vehicle_driver_assignments` — the open
 * Samsara ELD assignment on the UNIT — and never selected `mdata.loads.assigned_primary_driver_id` at all.
 * So a unit with no OPEN ELD assignment rendered a BLANK driver even though the load had one, which is why
 * the same rows resolved a driver fine in the load drawer and on Kanban cards: those read the load.
 * Verified on prod 2026-08-08 by the owner — assigned_primary_driver_id is populated on every
 * dispatched/in-transit load (L-0104, L-0099, LUSMCAFREIGHT-0002/-0004 and the three completed ones),
 * yet 4 of 5 board rows showed no driver. A read-path defect, not missing data.
 *
 * Why it is not cosmetic: Trip Pairing is the surface where a dispatcher picks who gets a return leg. A
 * blank driver there hides who is actually on the truck.
 *
 * Ordering matters as much as presence — the ELD assignment must remain a FALLBACK. If telematics were
 * preferred, a stale open assignment would silently override the dispatcher's own choice.
 *
 *   node scripts/verify-trip-pairing-driver-from-load.mjs
 *   node scripts/verify-trip-pairing-driver-from-load.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-trip-pairing-driver-from-load";
const SVC = "apps/backend/src/dispatch/trip-pairing-board.service.ts";

function assert(files) {
  const problems = [];
  const svc = files[SVC] ?? "";

  if (!/assigned_primary_driver_id/.test(svc)) {
    problems.push(
      `${SVC}: must SELECT mdata.loads.assigned_primary_driver_id (FAIL-TP1). Resolving the driver only ` +
        `from telematics.vehicle_driver_assignments leaves the board blank for any unit without an open ` +
        `ELD assignment, while the load drawer and Kanban — which read the load — show a driver.`,
    );
  }

  // The name has to come from somewhere, or the column renders an id or nothing.
  if (!/LEFT JOIN mdata\.drivers\s+\w+\s+ON\s+\w+\.id\s*=\s*l\.assigned_primary_driver_id/.test(svc)) {
    problems.push(`${SVC}: must LEFT JOIN mdata.drivers on l.assigned_primary_driver_id to resolve the driver NAME`);
  }

  if (!/FROM mdata\.driver_company_authorizations trip_pairing_load_driver_dca[\s\S]{0,180}trip_pairing_load_driver_dca\.driver_id = ld\.id[\s\S]{0,140}trip_pairing_load_driver_dca\.company_id = l\.operating_company_id[\s\S]{0,140}trip_pairing_load_driver_dca\.is_authorized = true[\s\S]{0,140}trip_pairing_load_driver_dca\.deactivated_at IS NULL/.test(svc)) {
    problems.push(`${SVC}: load-driver label must admit active canonical selected-company authorization`);
  }

  if (!/FROM mdata\.driver_company_authorizations trip_pairing_eld_driver_dca[\s\S]{0,180}trip_pairing_eld_driver_dca\.driver_id = d\.id[\s\S]{0,140}trip_pairing_eld_driver_dca\.company_id = a\.operating_company_id[\s\S]{0,140}trip_pairing_eld_driver_dca\.is_authorized = true[\s\S]{0,140}trip_pairing_eld_driver_dca\.deactivated_at IS NULL/.test(svc)) {
    problems.push(`${SVC}: ELD fallback driver label must admit active canonical assignment-company authorization`);
  }

  // Precedence: the load's dispatch assignment wins, telematics is the fallback.
  if (!/loadDrv\s*\?\?\s*eldDrv/.test(svc)) {
    problems.push(
      `${SVC}: the load's dispatch-assigned driver must take precedence over the ELD assignment ` +
        `(expected \`loadDrv ?? eldDrv\`). Preferring telematics lets a stale open assignment override ` +
        `the dispatcher's own choice.`,
    );
  }

  if (!/SELECT scheduled_arrival_at FROM mdata\.load_stops[\s\S]{0,140}stop_type = 'pickup' AND soft_deleted_at IS NULL[\s\S]{0,100}ORDER BY sequence_number ASC/.test(svc)) {
    problems.push(`${SVC}: pickup endpoint must come from active load_stops history only`);
  }

  if (!/SELECT city, state, scheduled_arrival_at FROM mdata\.load_stops[\s\S]{0,160}stop_type = 'delivery' AND soft_deleted_at IS NULL[\s\S]{0,100}ORDER BY sequence_number DESC/.test(svc)) {
    problems.push(`${SVC}: delivery endpoint must come from active load_stops history only`);
  }

  return problems;
}

const files = Object.fromEntries([SVC].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [];

  // 1. The original defect: no load driver in the query at all.
  const noLoadDriver = { ...files, [SVC]: files[SVC].replace(/assigned_primary_driver_id/g, "assigned_unit_id") };
  checks.push(["load driver dropped", assert(noLoadDriver).some((p) => /must SELECT/.test(p))]);

  // 2. Precedence inverted — telematics wins again.
  const inverted = { ...files, [SVC]: files[SVC].replace("loadDrv ?? eldDrv", "eldDrv ?? loadDrv") };
  checks.push(["precedence inverted", assert(inverted).some((p) => /must take precedence/.test(p))]);

  // 3. Name join removed — column would render blank or an id.
  const noJoin = {
    ...files,
    [SVC]: files[SVC].replace(/LEFT JOIN mdata\.drivers ld ON ld\.id = l\.assigned_primary_driver_id\n/, ""),
  };
  checks.push(["name join removed", assert(noJoin).some((p) => /resolve the driver NAME/.test(p))]);

  const noSharedDriver = {
    ...files,
    [SVC]: files[SVC].replace("trip_pairing_load_driver_dca.is_authorized = true", "trip_pairing_load_driver_dca.is_authorized = false"),
  };
  checks.push(["shared-driver authorization removed", assert(noSharedDriver).some((p) => /active canonical/.test(p))]);

  const noSharedEldDriver = {
    ...files,
    [SVC]: files[SVC].replace("trip_pairing_eld_driver_dca.is_authorized = true", "trip_pairing_eld_driver_dca.is_authorized = false"),
  };
  checks.push(["shared ELD-driver authorization removed", assert(noSharedEldDriver).some((p) => /ELD fallback driver/.test(p))]);

  const retiredPickup = {
    ...files,
    [SVC]: files[SVC].replace("stop_type = 'pickup' AND soft_deleted_at IS NULL", "stop_type = 'pickup'"),
  };
  checks.push(["retired pickup admitted", assert(retiredPickup).some((p) => /pickup endpoint/.test(p))]);

  const retiredDelivery = {
    ...files,
    [SVC]: files[SVC].replace("stop_type = 'delivery' AND soft_deleted_at IS NULL", "stop_type = 'delivery'"),
  };
  checks.push(["retired delivery admitted", assert(retiredDelivery).some((p) => /delivery endpoint/.test(p))]);

  const failed = checks.filter(([, caught]) => !caught).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — board reads the load's assigned driver, ELD assignment is the fallback`);
process.exit(0);
