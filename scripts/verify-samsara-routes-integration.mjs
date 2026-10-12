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
  // LEAD 443.99 class B (2026-10-12) — the two checks below.
  //   old rules: the route body fabricates ih35Unit:${unitId} / ih35Driver:${driverId} external ids; eligible loads
  //              filter `u.currently_leased_to_company_id = $1` only.
  //   new rules: the route is assigned to Samsara's OWN vehicle id (vehicleId: input.samsaraVehicleId) and never to a
  //              vehicle and a driver at once, keyed by ih35Load, with each stop's correlations built by
  //              buildIh35SamsaraExternalIds(stop.externalIds); eligible units are scoped by the fleet-wide operator
  //              rule COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1, loads by company.
  //   why: ROUND 306 E-31 (#23651, 3aa1acb612) — Samsara has no ih35Unit/ih35Driver ids (mirror-first) and refuses a
  //        route assigned to both (HTTP 400, probed 2026-10-01); the lease-only scope dropped USMCA-owned unleased trucks.
  ["route create carries canonical unit, driver and stop correlations", () => {
    const upsert = source.client.slice(source.client.indexOf("async upsertRoute("), source.client.indexOf("async upsertRoute(") + 3500);
    return upsert.includes("vehicleId: input.samsaraVehicleId,") && !/\bdriverId:\s*input\.samsaraDriverId/.test(upsert) &&
      upsert.includes("buildIh35SamsaraExternalIds({ ih35Load: input.loadId })") && upsert.includes("buildIh35SamsaraExternalIds(stop.externalIds)");
  }],
  ["eligible loads use the exact USMCA lease predicate", () => source.service.includes("COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid") && source.service.includes("l.operating_company_id = $1::uuid")],
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
  const clean = evaluate({});
  if (clean.length) throw new Error(`selftest: real sources flagged — ${clean.join("; ")}`);
  const mutations = [
    { service: source.service.replace("COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid", "u.currently_leased_to_company_id = $1::uuid") },
    { service: `${source.service}\n// last_seen_at` },
    { client: source.client.replace("vehicleId: input.samsaraVehicleId,", "vehicleId: input.samsaraVehicleId,\n      driverId: input.samsaraDriverId,") },
    { client: source.client.replace("vehicleId: input.samsaraVehicleId,", "vehicleId: `ih35Unit:${input.unitId}`,") },
    { client: source.client.replace("externalIds: buildIh35SamsaraExternalIds(stop.externalIds),", "externalIds: {},") },
    { service: source.service.replaceAll("l.operating_company_id = $1::uuid", "TRUE") },
    { projection: source.projection.replace('normalized === "routestopdeparture"', "false") },
    { index: source.index.replaceAll("registerSamsaraRoutesIntegration", "registerMissingRoutesIntegration") },
  ];
  for (const mutation of mutations) {
    const [key, value] = Object.entries(mutation)[0];
    if (value === source[key]) throw new Error(`selftest plant did not apply (${key}) — anchor drifted`);
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
