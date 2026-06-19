#!/usr/bin/env node
// Guard — vehicle->driver pairing must resolve the local unit on the SAME key the fleet board + position
// ingest use (mdata.units.samsara_vehicle_id). GUARD live-verified: keying on mdata.equipment dropped 9 of
// 10 logged-in drivers because the assignment was written against a unit the board never reads. Lock the
// units-keyed resolution + the 5-min cron driver pairing so it can't regress.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-driver-pairing-units-key: ${m}`); process.exit(1); };

const svc = read("apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.js".replace(".js", ".ts"));
// PRIMARY resolution must key on mdata.units.samsara_vehicle_id (the board's key).
if (!/FROM\s+mdata\.units[\s\S]{0,200}samsara_vehicle_id\s*=\s*\$2/.test(svc))
  fail("resolveLocalUnitAndDriver must resolve the unit PRIMARY via mdata.units.samsara_vehicle_id (the fleet board's key)");
// Driver still maps via mdata.drivers.samsara_driver_id.
if (!/FROM\s+mdata\.drivers[\s\S]{0,160}samsara_driver_id\s*=\s*\$2/.test(svc))
  fail("driver must map via mdata.drivers.samsara_driver_id");

// Parse must NOT require startTime — Samsara's CURRENT assignment objects don't carry it, and the old
// `|| !startedAt` dropped every current assignment (worker wrote 0 while the probe resolved 10).
if (/!samsaraDriverId\s*\|\|\s*!startedAt/.test(svc))
  fail("parseSamsaraVehicleAssignments must NOT require startTime (drops every current assignment -> 0 written)");
if (!/if \(!samsaraDriverId\) continue/.test(svc))
  fail("parse must require only the driver id (startTime optional, falls back to now)");
// Handoff: exactly one open assignment per unit (end stale opens before inserting the current one).
if (!/UPDATE telematics\.vehicle_driver_assignments[\s\S]{0,200}ended_at IS NULL[\s\S]{0,120}samsara_assignment_id IS DISTINCT FROM/.test(svc))
  fail("upsert must end other open assignments on the unit before inserting the current one (one-open-per-unit)");

// The pairing sync MUST be observable — it used to swallow errors (invisible while the stats cron looked
// healthy). It now writes its result/error to integrations.integration_sync_log.
if (!/integration_sync_log[\s\S]{0,400}vehicle_driver_pairing/.test(svc))
  fail("syncFromSamsara must log success/error to integration_sync_log (sync_kind='vehicle_driver_pairing')");

// The pairing path uses ONLY /fleet/vehicles/driver-assignments (200) — never the invalid
// /fleet/vehicles/stats types=...,driverAssignments variant (400), and never the `limit` param (the
// working probe call omits it; Samsara's driver-assignments endpoint rejected limit=512 -> 0 rows).
if (/\/fleet\/vehicles\/stats|types=[^"']*driverAssignments/.test(svc))
  fail("pairing path must NOT call the /fleet/vehicles/stats types=...,driverAssignments variant (400)");
if (!/\/fleet\/vehicles\/driver-assignments/.test(svc))
  fail("pairing must fetch /fleet/vehicles/driver-assignments");
if (/driver-assignments[\s\S]{0,300}searchParams\.set\("limit"/.test(svc))
  fail("pairing driver-assignments call must NOT set the limit param (the working probe call omits it)");

// The proven 5-min positions cron must drive the pairing sync, run it INDEPENDENTLY (a locations/stats
// failure must not skip it), and NOT hold one DB transaction across all the Samsara network I/O.
const cron = read("apps/backend/src/cron/samsara-positions-cron.ts");
if (!/syncFromSamsara\(c, operatingCompanyId/.test(cron))
  fail("the 5-min positions cron must call syncFromSamsara so drivers populate every 5 min");
// Each operation must run in its OWN short, tenant-scoped transaction (runScoped) — never one giant
// transaction across the whole tick + all fetches (that rolled the whole tick back, persisting nothing).
if (!/runScoped[\s\S]{0,200}set_config\('app\.operating_company_id'/.test(cron))
  fail("cron must run each operation in its own short tenant-scoped transaction (runScoped), not one giant tx");
if (/withLuciaBypass\(async \(client\) => \{\s*\n\s*const activeTenantIds/.test(cron))
  fail("cron must NOT wrap the whole tenant loop + all syncs in one withLuciaBypass transaction");
// Samsara fetches must be timeout-bounded so a stalled socket can't hold a transaction/connection open.
const client = read("apps/backend/src/integrations/samsara/samsara-client.ts");
if (!/export async function samsaraFetch[\s\S]{0,300}AbortController/.test(client))
  fail("samsara-client must expose a timeout-bounded samsaraFetch (AbortController)");

console.log("OK verify-driver-pairing-units-key: pairing resolves unit via mdata.units key + 5-min cron pairing locked.");
