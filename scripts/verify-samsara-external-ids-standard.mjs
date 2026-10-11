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
  // 443.49 (Lead 443.52 C — rule updated to today's design): OLD rule — the geofence create correlates ih35Load / ih35Stop /
  // ih35Site. NEW rule — it correlates ih35Site = the fence id ONLY, and must NOT send ih35Load / ih35Stop. WHY: Samsara keeps an
  // external-id value unique per key across addresses, and a fence is a facility shared by many loads (one location + one fence
  // per facility, 443.49 #3) — the load's second facility was refused samsara_http_400 (11 creates, 2026-10-11).
  const externalBlock = (handler.match(/externalIds:\s*\{([\s\S]*?)\}/) || [])[1] ?? "";
  if (!/ih35Site:\s*geofenceId/.test(externalBlock)) failures.push(`${HANDLER}: geofence create must correlate ih35Site to geofenceId`);
  for (const key of ["ih35Load", "ih35Stop"]) {
    if (new RegExp(`${key}:`).test(externalBlock)) failures.push(`${HANDLER}: geofence create must not send ${key} (a facility fence is shared by many loads; Samsara refuses a reused value)`);
  }
  if (!/already_in_samsara/.test(handler)) failures.push(`${HANDLER}: a fence that already has its Samsara address must not be created twice`);
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
    { ...sources, handler: sources.handler.replace("ih35Site: geofenceId,", "ih35Site: geofenceId, ih35Load: loadId,") },
    { ...sources, handler: sources.handler.replace("ih35Site: geofenceId,", "ih35Site: geofenceId, ih35Stop: stopId,") },
    { ...sources, handler: sources.handler.replace("ih35Site: geofenceId", "ih35Site: loadId") },
    { ...sources, handler: sources.handler.replace(/already_in_samsara/g, "x") },
  ];
  if (mutations.some((mutation) => audit(mutation).length === 0)) {
    fail(["planted externalIds mutation escaped"]);
  }
  console.log("verify-samsara-external-ids-standard SELFTEST PASS 7/7");
}

console.log("verify-samsara-external-ids-standard PASS — canonical six-key vocabulary and the geofence create correlates its own fence id only (443.49)");
