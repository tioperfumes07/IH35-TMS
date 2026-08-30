#!/usr/bin/env node
// SAMSARA-SYNC-ERRORS-SILENTLY-DROPPED: syncSamsaraDriversMaster()/syncSamsaraVehiclesMaster()/
// syncSamsaraTrailersMaster() each compute a per-row `errors` array (from their own SAVEPOINT
// try/catch blocks) but their FINAL writeSyncLog() call never passed it as errorMessage -- a
// success:false row in integrations.integration_sync_log carried no detail on what actually failed,
// even though writeSyncLog's own early-exit call sites in the same functions already pass
// errorMessage. Confirmed live: the 2026-08-30 22:30Z cron tick logged assets_master success:false
// (rows_updated 100/3) with error_message NULL. Guard requires all 3 final writeSyncLog() calls to
// pass errorMessage derived from the errors array.
import fs from "node:fs";

const FILE = "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts";

function inspect(source) {
  const failures = [];

  const occurrences = (source.match(/errorMessage: errors\.length > 0 \? errors\.join\("; "\) : null,/g) ?? []).length;
  if (occurrences < 3) {
    failures.push(`expected 3 final writeSyncLog() calls (drivers/vehicles/trailers) to pass errorMessage from errors, found ${occurrences}`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-samsara-sync-errors-surfaced-in-log --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  // Mutate exactly one occurrence back to dropping the error detail.
  const mutated = real.replace(
    'errorMessage: errors.length > 0 ? errors.join("; ") : null,\n    payload: { remote_count: vehicles.length },',
    "payload: { remote_count: vehicles.length },"
  );
  if (mutated === real) {
    console.error("verify-samsara-sync-errors-surfaced-in-log --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-samsara-sync-errors-surfaced-in-log --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-samsara-sync-errors-surfaced-in-log --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-samsara-sync-errors-surfaced-in-log FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-samsara-sync-errors-surfaced-in-log: OK — all 3 Samsara master-sync functions surface their per-row errors into integration_sync_log.error_message");
