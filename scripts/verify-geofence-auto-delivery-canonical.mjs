#!/usr/bin/env node
/**
 * ROUND 315: auto-delivery from geofence evidence moves status ONLY through the canonical transition service
 * (the same one the office route calls), only on telematics-stamped departures, only behind its own flag.
 */
import { readFileSync } from "node:fs";
const svc = readFileSync("apps/backend/src/dispatch/geofence-auto-delivery.service.ts", "utf8");
const route = readFileSync("apps/backend/src/dispatch/loads.routes.ts", "utf8");
const tx = readFileSync("apps/backend/src/dispatch/load-transition.service.ts", "utf8");
const checks = [
  [/transitionDispatchLoadInClientTx\(/.test(svc) && !/UPDATE mdata\.loads/.test(svc), "engine moves status only via transitionDispatchLoadInClientTx"],
  [/return transitionDispatchLoadInClientTx\(client, authUser\.uuid/.test(route), "office route delegates to the same service"],
  [/ensureDriverBillArtifactsForLoad\(/.test(tx) && /latchOnDeliveryEvidence\(/.test(tx), "service mints the driver bill and latches revenue/invoice"],
  [/actual_arrival_source = 'eld_geofence'/.test(svc), "only telematics-evidenced departures qualify"],
  [/AUTO_DELIVERY_FROM_GEOFENCE_APPLY === "true"/.test(svc), "writes only behind AUTO_DELIVERY_FROM_GEOFENCE_APPLY"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-geofence-auto-delivery-canonical: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-geofence-auto-delivery-canonical: OK (${checks.length})`);
