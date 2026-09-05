#!/usr/bin/env node
import { readFileSync } from "node:fs";

const CLIENT = "apps/backend/src/integrations/samsara/samsara-client.ts";
const IDS = "apps/backend/src/integrations/samsara/samsara-external-ids.ts";
const HANDLER = "apps/backend/src/outbox/handlers/samsara-create-geofence.handler.ts";

const sources = {
  client: readFileSync(CLIENT, "utf8"),
  ids: readFileSync(IDS, "utf8"),
  handler: readFileSync(HANDLER, "utf8"),
};

function audit({ client, ids, handler }) {
  const failures = [];
  for (const key of ["ih35Driver", "ih35Unit", "ih35Trailer", "ih35Load", "ih35Stop", "ih35Site"]) {
    if (!ids.includes(`"${key}"`)) failures.push(`${IDS}: missing canonical ${key} key`);
  }
  if (!/if \(entries\.length === 0\) throw new Error\("samsara_external_ids_required"\)/.test(ids)) {
    failures.push(`${IDS}: empty correlation map must fail closed`);
  }
  if (!/async createAddress\([\s\S]*externalIds: Ih35SamsaraExternalIds/.test(client)) {
    failures.push(`${CLIENT}: address create must require canonical IH35 external ids`);
  }
  if (!/externalIds:\s*\{[\s\S]*ih35GeofenceId:[\s\S]*buildIh35SamsaraExternalIds\(input\.externalIds\)/.test(client)) {
    failures.push(`${CLIENT}: address request must serialize canonical externalIds (legacy geofence id retained)`);
  }
  for (const [key, value] of [["ih35Load", "loadId"], ["ih35Stop", "stopId"], ["ih35Site", "geofenceId"]]) {
    if (!new RegExp(`${key}:\\s*${value}`).test(handler)) {
      failures.push(`${HANDLER}: X.9 create must correlate ${key} to ${value}`);
    }
  }
  return failures;
}

function fail(failures) {
  console.error("verify-samsara-external-ids-standard FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const failures = audit(sources);
if (failures.length) fail(failures);

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, ids: sources.ids.replace('"ih35Driver",', '"removedDriver",') },
    { ...sources, ids: sources.ids.replace('if (entries.length === 0)', 'if (false)') },
    { ...sources, client: sources.client.replace("buildIh35SamsaraExternalIds(input.externalIds)", "input.externalIds") },
    { ...sources, handler: sources.handler.replace("ih35Load: loadId", "ih35Load: stopId") },
    { ...sources, handler: sources.handler.replace("ih35Stop: stopId", "ih35Stop: loadId") },
    { ...sources, handler: sources.handler.replace("ih35Site: geofenceId", "ih35Site: loadId") },
  ];
  if (mutations.some((mutation) => audit(mutation).length === 0)) {
    fail(["planted externalIds mutation escaped"]);
  }
  console.log("verify-samsara-external-ids-standard SELFTEST PASS 6/6");
}

console.log("verify-samsara-external-ids-standard PASS — canonical six-key vocabulary and X.9 load/stop/site correlations are fail-closed");
