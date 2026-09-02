#!/usr/bin/env node
import fs from "node:fs";

const canonical = {
  service: fs.readFileSync("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/incident.service.ts", "utf8"),
  routes: fs.readFileSync("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts", "utf8"),
  index: fs.readFileSync("apps/backend/src/index.ts", "utf8"),
};

function verify(parts) {
  const failures = [];
  if (!parts.service.includes("processCargoSensorIncidents")) failures.push("canonical incident processor missing");
  if (!parts.routes.includes('"/api/v1/dispatch/cargo-incidents"')) failures.push("canonical list route missing");
  if (!parts.index.includes("registerCap14CargoSensorRoutes") || !parts.index.includes("initializeCap14CargoSensorWorker")) {
    failures.push("canonical cargo route/worker startup missing");
  }
  if (parts.index.includes("./dispatch/cargo-sensor-incidents.routes.js")) failures.push("duplicate cargo route registration");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const duplicate = { ...canonical, index: `${canonical.index}\nimport './dispatch/cargo-sensor-incidents.routes.js';` };
  const unmounted = {
    ...canonical,
    index: canonical.index
      .replaceAll("registerCap14CargoSensorRoutes", "removedCargoRoutes")
      .replaceAll("initializeCap14CargoSensorWorker", "removedCargoWorker"),
  };
  if (!verify(duplicate).includes("duplicate cargo route registration") || !verify(unmounted).includes("canonical cargo route/worker startup missing")) {
    console.error("verify-go20-d-cargo-sensor-incidents SELFTEST FAIL");
    process.exit(1);
  }
  console.log("verify-go20-d-cargo-sensor-incidents SELFTEST PASS — duplicate and unmounted cargo startup mutations rejected");
  process.exit(0);
}

const failures = verify(canonical);
if (failures.length) {
  console.error("verify-go20-d-cargo-sensor-incidents FAIL");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("verify-go20-d-cargo-sensor-incidents PASS — one canonical cargo incident route and worker path");
