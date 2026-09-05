#!/usr/bin/env node
import { readFileSync } from "node:fs";

const SERVICE = "apps/backend/src/integrations/samsara/geofences/real-driven-miles.service.ts";
const ENGINE = "apps/backend/src/integrations/samsara/geofences/state-machine/engine.ts";
const ROUTE = "apps/backend/src/integrations/samsara/positions/live-position.routes.ts";

const sources = {
  service: readFileSync(SERVICE, "utf8"),
  engine: readFileSync(ENGINE, "utf8"),
  route: readFileSync(ROUTE, "utf8"),
};

function audit({ service, engine, route }) {
  const failures = [];
  if (!service.includes("odometer_at_exit_mi") || !service.includes("odometerEndMi")) {
    failures.push(`${SERVICE}: leg must pair previous fence exit with current fence entry odometer`);
  }
  if (!service.includes('reason: "odometer_non_monotonic"')) {
    failures.push(`${SERVICE}: negative/reset odometer deltas must fail closed`);
  }
  if (!service.includes("INSERT INTO telematics.load_odometer_segments")) {
    failures.push(`${SERVICE}: canonical load_odometer_segments writer missing`);
  }
  if (!service.includes("l.miles_practical") || !service.includes("l.miles_shortest") || !service.includes("SUM(s.driven_miles)")) {
    failures.push(`${SERVICE}: read model must return practical, short, and real miles together`);
  }
  if (!/if \(stampEntry && input\.loadId && input\.stopId\)[\s\S]*recordCompletedLoadLeg/.test(engine)) {
    failures.push(`${ENGINE}: entering a load stop must materialize the completed leg`);
  }
  if (!route.includes("/api/integrations/samsara/loads/:load_uuid/real-miles")) {
    failures.push(`${ROUTE}: authenticated load real-miles endpoint missing`);
  }
  return failures;
}

function fail(failures) {
  console.error("verify-samsara-real-driven-miles-per-leg FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const failures = audit(sources);
if (failures.length) fail(failures);

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, service: sources.service.replace("odometer_at_exit_mi", "removed_exit_odometer") },
    { ...sources, service: sources.service.replace('reason: "odometer_non_monotonic"', 'reason: "ok"') },
    { ...sources, service: sources.service.replace("INSERT INTO telematics.load_odometer_segments", "INSERT INTO removed.segments") },
    { ...sources, service: sources.service.replace("SUM(s.driven_miles)", "SUM(0)") },
    { ...sources, engine: sources.engine.replace("recordCompletedLoadLeg(client", "removedRecordCompletedLoadLeg(client") },
    { ...sources, route: sources.route.replace("/api/integrations/samsara/loads/:load_uuid/real-miles", "/removed") },
  ];
  if (mutations.some((mutation) => audit(mutation).length === 0)) fail(["planted real-miles mutation escaped"]);
  console.log("verify-samsara-real-driven-miles-per-leg SELFTEST PASS 6/6");
}

console.log("verify-samsara-real-driven-miles-per-leg PASS — fence odometers materialize entity-scoped real miles beside planned miles");
