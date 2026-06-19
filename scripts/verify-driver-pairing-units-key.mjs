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

// The proven 5-min positions cron must drive the pairing sync (so the board's driver is as fresh as its
// position, not waiting on the hourly worker).
const cron = read("apps/backend/src/cron/samsara-positions-cron.ts");
if (!/syncFromSamsara\(client, operatingCompanyId/.test(cron))
  fail("the 5-min positions cron must call syncFromSamsara so drivers populate every 5 min");

console.log("OK verify-driver-pairing-units-key: pairing resolves unit via mdata.units key + 5-min cron pairing locked.");
