#!/usr/bin/env node
import fs from "node:fs";

function mustInclude(content, token, description) {
  if (!content.includes(token)) {
    throw new Error(`Missing ${description}: ${token}`);
  }
}

const servicePath = "apps/backend/src/telematics/auto-geofence.service.ts";
if (!fs.existsSync(servicePath)) throw new Error(`Missing service: ${servicePath}`);
const service = fs.readFileSync(servicePath, "utf8");
mustInclude(service, "l.operating_company_id = $1::uuid", "load stop tenant filter");
mustInclude(service, "g.operating_company_id = $1::uuid", "existing geofence tenant filter");
mustInclude(service, "operating_company_id,", "insert includes tenant column");

// Inv #40 (2026-09-05, PR #20684): the trigger moved OUT of the HTTP route and into bookLoad()
// itself (book-load.service.ts) so every caller gets it, not only loads.routes.ts's POST
// handler -- that PR's own dedicated guard (verify-book-load-geofence-service-layer.mjs) proves
// the wiring in full, including that the route must NOT call it (double-fire sentinel). This
// older, more narrowly-scoped check just needs to point at the current call site so it doesn't
// assert the pre-fix architecture.
const servicePath2 = "apps/backend/src/dispatch/book-load.service.ts";
if (!fs.existsSync(servicePath2)) throw new Error(`Missing service: ${servicePath2}`);
const bookLoadService = fs.readFileSync(servicePath2, "utf8");
mustInclude(bookLoadService, "autoCreateGeofencesForLoad", "bookLoad() hook call");

console.log("verify-auto-geofence-tenant-scope: ok");
