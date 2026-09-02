#!/usr/bin/env node
import fs from "node:fs";

const SERVICE = "apps/backend/src/integrations/samsara/cap-14-cargo-sensors/incident.service.ts";
const ROUTES = "apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts";
const WORKER = "apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts";
const PAGE = "apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx";
const AGGREGATOR = "apps/backend/src/owner/todays-attention/aggregator.service.ts";
const INDEX = "apps/backend/src/index.ts";

function verify(service, routes, worker, page, aggregator, index) {
  const errors = [];
  for (const token of [
    "dispatch.cargo_sensor_incidents",
    "dispatch.cargo_sensor_readings",
    "prior.uuid = i.last_reading_uuid",
    'threshold.source === "default"',
    "ON CONFLICT (operating_company_id, sensor_id, breach_kind)",
    "last_reading_uuid IS DISTINCT FROM EXCLUDED.last_reading_uuid",
    "SETTLING_WINDOW_MINUTES",
    "reading_at + ($5::text || ' minutes')::interval",
  ]) {
    if (!service.includes(token)) errors.push(`incident lifecycle missing ${token}`);
  }
  if (service.includes("telematics.cargo_sensor_incidents")) errors.push("incident lifecycle uses phantom telematics table");
  for (const token of [
    '"/api/v1/dispatch/cargo-incidents"',
    '"/api/v1/dispatch/cargo-incidents/:id/resolve"',
    '"/api/v1/dispatch/cargo-incidents/:id/file-claim"',
  ]) {
    if (!routes.includes(token)) errors.push(`routes missing ${token}`);
  }
  if (index.includes("./dispatch/cargo-sensor-incidents.routes.js")) errors.push("startup registers duplicate cargo incident routes");
  if (index.includes("predictive-alerts-worker.js") || index.includes("predictive-alerts.routes.js")) {
    errors.push("startup registers predictive-alert modules that do not exist");
  }
  if (!worker.includes("processCargoSensorIncidents(client, operatingCompanyId)")) errors.push("worker does not run incident lifecycle");
  if (!page.includes('data-testid="cargo-sensor-incidents"')) errors.push("load timeline does not render incidents above readings");
  if (!aggregator.includes('const table = "dispatch.cargo_sensor_incidents"')) errors.push("owner attention not repointed to dispatch incidents");
  return errors;
}

const sources = [SERVICE, ROUTES, WORKER, PAGE, AGGREGATOR, INDEX].map((path) => fs.readFileSync(path, "utf8"));
if (process.argv.includes("--selftest")) {
  const perReading = sources[0].replace("last_reading_uuid IS DISTINCT FROM EXCLUDED.last_reading_uuid", "true");
  if (!verify(perReading, ...sources.slice(1)).some((error) => error.includes("last_reading_uuid"))) {
    console.error("verify-go20-cargo-incidents SELFTEST FAIL — one-incident-per-excursion mutation escaped");
    process.exit(1);
  }
  const hardcoded = sources[0].replace('threshold.source === "default"', 'threshold.source === "never"');
  if (!verify(hardcoded, ...sources.slice(1)).some((error) => error.includes("threshold.source"))) {
    console.error("verify-go20-cargo-incidents SELFTEST FAIL — hard-coded/default threshold mutation escaped");
    process.exit(1);
  }
  const immediateClose = sources[0].replaceAll("SETTLING_WINDOW_MINUTES", "IMMEDIATE_CLOSE");
  if (!verify(immediateClose, ...sources.slice(1)).some((error) => error.includes("SETTLING_WINDOW_MINUTES"))) {
    console.error("verify-go20-cargo-incidents SELFTEST FAIL — settling-window mutation escaped");
    process.exit(1);
  }
  const duplicateRoute = `${sources[5]}\nimport './dispatch/cargo-sensor-incidents.routes.js';`;
  if (!verify(...sources.slice(0, 5), duplicateRoute).some((error) => error.includes("duplicate cargo incident routes"))) {
    console.error("verify-go20-cargo-incidents SELFTEST FAIL — duplicate route mutation escaped");
    process.exit(1);
  }
  const danglingStartup = `${sources[5]}\nimport './jobs/predictive-alerts-worker.js';`;
  if (!verify(...sources.slice(0, 5), danglingStartup).some((error) => error.includes("do not exist"))) {
    console.error("verify-go20-cargo-incidents SELFTEST FAIL — dangling startup import mutation escaped");
    process.exit(1);
  }
  console.log("verify-go20-cargo-incidents SELFTEST PASS — planted lifecycle, duplicate-route, and dangling-startup regressions caught");
  process.exit(0);
}

const errors = verify(...sources);
if (errors.length) {
  console.error("verify-go20-cargo-incidents FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("verify-go20-cargo-incidents PASS — persistent dispatch incident lifecycle is wired to worker, API, load timeline, and owner attention");
