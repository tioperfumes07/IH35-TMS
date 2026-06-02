#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesPath = path.join(ROOT, "apps/backend/src/mdata/units.routes.ts");
const aggregatePath = path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts");

const routes = fs.readFileSync(routesPath, "utf8");
const aggregate = fs.readFileSync(aggregatePath, "utf8");

const routeStart = routes.indexOf('app.get("/api/v1/mdata/units/:id"');
if (routeStart < 0) {
  console.error("verify:aggregate-shape-route FAIL: missing GET /api/v1/mdata/units/:id route");
  process.exit(1);
}
const routeHandler = routes.slice(routeStart, routeStart + 2500);
if (!routeHandler.includes("buildUnitAggregate(")) {
  console.error("verify:aggregate-shape-route FAIL: GET /api/v1/mdata/units/:id must call buildUnitAggregate");
  process.exit(1);
}
if (/reply\.code\(\d+\)\.send\(row\)|SELECT[\s\S]{0,120}FROM mdata\.units[\s\S]{0,120}LIMIT 1/.test(routeHandler)) {
  console.error("verify:aggregate-shape-route FAIL: GET /api/v1/mdata/units/:id appears to return flat SELECT row");
  process.exit(1);
}

const fnStart = aggregate.indexOf("export async function buildUnitAggregate");
if (fnStart < 0) {
  console.error("verify:aggregate-shape-route FAIL: missing buildUnitAggregate export");
  process.exit(1);
}
const fnBody = aggregate.slice(fnStart);

const requiredKeys = ["unit", "plates", "samsara", "compliance", "open_wo_count", "reefer", "maintenance_alerts"];
const missing = requiredKeys.filter((k) => !fnBody.includes(`${k},`) && !fnBody.includes(`${k}:`));
if (missing.length > 0) {
  console.error(`verify:aggregate-shape-route FAIL: buildUnitAggregate return missing keys: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("verify:aggregate-shape-route PASS");
