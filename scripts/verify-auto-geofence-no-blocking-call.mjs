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

console.log("verify-auto-geofence-no-blocking-call: ok");
