#!/usr/bin/env node
/**
 * ROUND 313: Samsara GeofenceEntry/Exit webhooks reach the CANONICAL fence detector with the truck's own real GPS
 * fix -- never a second writer of geo.geofence_events, never a point synthesised from the Samsara address.
 */
import { readFileSync } from "node:fs";
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
