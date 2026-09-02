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
  if (parts.index.includes("./dispatch/cargo-sensor-incidents.routes.js")) failures.push("duplicate cargo route registration");
  if (parts.index.includes("predictive-alerts-worker.js") || parts.index.includes("predictive-alerts.routes.js")) failures.push("dangling predictive-alert registration");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const duplicate = { ...canonical, index: `${canonical.index}\nimport './dispatch/cargo-sensor-incidents.routes.js';` };
  const dangling = { ...canonical, index: `${canonical.index}\nimport './jobs/predictive-alerts-worker.js';` };
  if (!verify(duplicate).includes("duplicate cargo route registration") || !verify(dangling).includes("dangling predictive-alert registration")) {
    console.error("verify-go20-d-cargo-sensor-incidents SELFTEST FAIL");
    process.exit(1);
  }
  console.log("verify-go20-d-cargo-sensor-incidents SELFTEST PASS — duplicate and dangling startup mutations rejected");
  process.exit(0);
}

const failures = verify(canonical);
if (failures.length) {
  console.error("verify-go20-d-cargo-sensor-incidents FAIL");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("verify-go20-d-cargo-sensor-incidents PASS — one canonical cargo incident route and worker path");
