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

const routePath = "apps/backend/src/dispatch/loads.routes.ts";
if (!fs.existsSync(routePath)) throw new Error(`Missing dispatch route: ${routePath}`);
const routes = fs.readFileSync(routePath, "utf8");
mustInclude(routes, "autoCreateGeofencesForLoad", "route hook call");

console.log("verify-auto-geofence-tenant-scope: ok");
