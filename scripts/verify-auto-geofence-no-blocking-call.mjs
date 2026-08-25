#!/usr/bin/env node
import fs from "node:fs";

const routePath = "apps/backend/src/dispatch/loads.routes.ts";
if (!fs.existsSync(routePath)) throw new Error(`Missing dispatch route: ${routePath}`);
const content = fs.readFileSync(routePath, "utf8");

if (!content.includes("void autoCreateGeofencesForLoad")) {
  throw new Error("CAP-2 requires non-blocking hook: expected `void autoCreateGeofencesForLoad` in dispatch load route");
}
if (content.includes("await autoCreateGeofencesForLoad")) {
  throw new Error("CAP-2 requires non-blocking hook: found awaited auto-geofence call in request path");
}

const servicePath = "apps/backend/src/telematics/auto-geofence.service.ts";
if (!fs.existsSync(servicePath)) throw new Error(`Missing auto-geofence service: ${servicePath}`);
const service = fs.readFileSync(servicePath, "utf8");
if (!service.includes('enqueueOutboxEvent')) {
  throw new Error("CAP-2 outbound requires enqueueOutboxEvent after TMS geofence insert");
}
if (!service.includes('"samsara.create_geofence"')) {
  throw new Error("CAP-2 outbound requires literal event type samsara.create_geofence");
}
if (!service.includes("TMS_AUTO_GEOFENCE_SIDE_METERS")) {
  throw new Error("CAP-2 TMS fence must use WF-051 TMS_AUTO_GEOFENCE_SIDE_METERS (250 ft)");
}

const registryPath = "apps/backend/src/outbox/handlers/registry.ts";
const registry = fs.readFileSync(registryPath, "utf8");
if (!registry.includes("SamsaraCreateGeofenceHandler")) {
  throw new Error("samsara.create_geofence must be registered in outbox handler registry");
}

const clientPath = "apps/backend/src/integrations/samsara/samsara-client.ts";
const client = fs.readFileSync(clientPath, "utf8");
if (!client.includes("async createAddress") || !client.includes("${SAMSARA_API_BASE}/addresses")) {
  throw new Error("SamsaraClient.createAddress must POST /addresses");
}

console.log("verify-auto-geofence-no-blocking-call: ok");
