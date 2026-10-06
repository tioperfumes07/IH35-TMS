#!/usr/bin/env node
/**
 * ROUND 313: Samsara GeofenceEntry/Exit webhooks reach the CANONICAL fence detector with the truck's own real GPS
 * fix -- never a second writer of geo.geofence_events, never a point synthesised from the Samsara address.
 */
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--selftest")) selftest();

const p = readFileSync("apps/backend/src/integrations/samsara/webhook-projectors/geofence-projector.ts", "utf8");
const svc = readFileSync("apps/backend/src/integrations/samsara/webhook-projection.service.ts", "utf8");
const checks = [
  [/normalized === "geofenceentry" \|\| normalized === "geofenceexit"\) return "geofence"/.test(svc) && /route === "geofence"\) return projectGeofenceEvent/.test(svc), "GeofenceEntry/Exit routed to the geofence projector"],
  [/processGeofenceDetectionsForGpsPoint\(/.test(p) && !/INSERT INTO geo\.geofence_events/.test(p), "the detector is the only writer"],
  [/FROM telematics\.vehicle_locations v/.test(p) && /interval '5 minutes'/.test(p), "uses the truck's real fix within 5 minutes"],
  [/classification: "transient"/.test(p), "no fix yet -> transient retry"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-geofence-webhook-feeds-detector: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-geofence-webhook-feeds-detector: OK (${checks.length})`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-geofence-webhook-feeds-detector", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
