#!/usr/bin/env node
import fs from "node:fs";

const files = {
  client: "apps/backend/src/integrations/samsara/samsara-client.ts",
  service: "apps/backend/src/integrations/samsara/routes-integration.service.ts",
  routes: "apps/backend/src/integrations/samsara/routes-integration.routes.ts",
  projection: "apps/backend/src/integrations/samsara/webhook-projection.service.ts",
  index: "apps/backend/src/index.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["route upsert is idempotently keyed by the canonical load external id", () => source.client.includes("/fleet/routes/${encodeURIComponent(externalRouteId)}") && source.client.includes("ih35Load: input.loadId")],
  ["route create carries canonical unit, driver and stop correlations", () => source.client.includes("ih35Unit:${input.unitId}") && source.client.includes("ih35Driver:${input.driverId}") && source.client.includes("buildIh35SamsaraExternalIds(stop.externalIds)")],
  ["eligible loads use the exact USMCA lease predicate", () => source.service.includes("u.currently_leased_to_company_id = $1::uuid") && source.service.includes("l.operating_company_id = $1::uuid")],
  ["active routes never depend on stale samsara driver last_seen_at", () => !source.service.includes("last_seen_at")],
  ["arrival and departure projection is company, load and stop scoped", () => source.service.includes("ls.id = $3::uuid AND ls.load_id = l.id") && source.service.includes("l.operating_company_id = $1::uuid") && source.service.includes("actual_arrival_at") && source.service.includes("actual_departure_at")],
  ["signed WORM projection recognizes both route-stop event types", () => source.projection.includes('normalized === "routestoparrival"') && source.projection.includes('normalized === "routestopdeparture"') && source.projection.includes("projectRouteStopEvent")],
  ["authenticated list and push endpoints are mounted", () => source.routes.includes('/api/v1/integrations/samsara/routes/eligible') && source.routes.includes('/api/v1/integrations/samsara/routes/:load_id/push') && source.routes.includes("assertCompanyMembership") && source.index.includes("registerSamsaraRoutesIntegration")],
];

function evaluate(candidate) {
  const old = { ...source };
  Object.assign(source, candidate);
  const failed = checks.filter(([, check]) => !check()).map(([name]) => name);
  Object.assign(source, old);
  return failed;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { service: source.service.replace("u.currently_leased_to_company_id = $1::uuid", "u.owner_company_id = $1::uuid") },
    { service: `${source.service}\n// last_seen_at` },
    { client: source.client.replace("ih35Unit:${input.unitId}", "unit:${input.unitId}") },
    { service: source.service.replaceAll("l.operating_company_id = $1::uuid", "TRUE") },
    { projection: source.projection.replace('normalized === "routestopdeparture"', "false") },
    { index: source.index.replaceAll("registerSamsaraRoutesIntegration", "registerMissingRoutesIntegration") },
  ];
  for (const mutation of mutations) {
    if (evaluate(mutation).length === 0) throw new Error("selftest mutation escaped detection");
  }
  console.log(`PASS verify-samsara-routes-integration --selftest ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const failed = evaluate({});
if (failed.length) {
  for (const name of failed) console.error(`FAIL ${name}`);
  process.exit(1);
}
console.log(`PASS verify-samsara-routes-integration ${checks.length}/${checks.length}`);
