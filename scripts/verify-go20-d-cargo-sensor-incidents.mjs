import fs from "node:fs";
function read(path) { return fs.readFileSync(path, "utf8"); }
function verify(parts) {
  return [
    /export function classifyReadingBreaches/.test(parts.service),
    /export async function resolveThresholdsForLoad/.test(parts.service),
    /customer_metadata/.test(parts.service),
    /resolveCargoThresholds\(mergeMetadata/.test(parts.service),
    /export async function processCargoSensorReadingForIncidents/.test(parts.service),
    /export async function syncCargoSensorIncidentsForCompany/.test(parts.service),
    /export async function closeSettledIncidents/.test(parts.service),
    /SETTLING_WINDOW_MINUTES = 5/.test(parts.service),
    /cargo_sensor_incidents_breach_kind_check/.test(parts.migration),
    /ix_cargo_incident_load/.test(parts.migration),
    /first_reading_uuid uuid NULL REFERENCES dispatch\.cargo_sensor_readings\(uuid\)/.test(parts.migration),
    /dispatch\.cargo_sensor_readings/.test(parts.service),
    /registerCargoSensorIncidentRoutes/.test(parts.routes),
    /rateLimit/.test(parts.routes),
    /syncCargoSensorIncidentsForCompany/.test(parts.worker),
    /processCargoSensorReadingForIncidents/.test(parts.ingester),
    /registerCargoSensorIncidentRoutes/.test(parts.index),
    /dispatch\.cargo_sensor_incidents/.test(parts.aggregator),
    !/telematics\.cargo_sensor_incidents/.test(parts.aggregator),
    /cargo-sensor-incidents/.test(parts.timeline),
    /dispatch\/cargo-incidents/.test(parts.timeline),
    /verify-go20-d-cargo-sensor-incidents/.test(parts.cap14),
  ].every(Boolean);
}
const parts = {
  service: read("apps/backend/src/dispatch/cargo-sensor-incidents.service.ts"),
  routes: read("apps/backend/src/dispatch/cargo-sensor-incidents.routes.ts"),
  migration: read("db/migrations/202613390002_go20_d_cargo_sensor_incidents.sql"),
  worker: read("apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts"),
  ingester: read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/ingester.service.ts"),
  index: read("apps/backend/src/index.ts"),
  aggregator: read("apps/backend/src/owner/todays-attention/aggregator.service.ts"),
  timeline: read("apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx"),
  cap14: read("scripts/verify-cap-14-cargo-sensors.mjs"),
};
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...parts, service: parts.service.replace("SETTLING_WINDOW_MINUTES = 5", "SETTLING_WINDOW_MINUTES = 1") },
    { ...parts, routes: parts.routes.replace(/rateLimit/g, "throttle") },
    { ...parts, worker: parts.worker.replace(/syncCargoSensorIncidentsForCompany/g, "processOutOfRangeAlerts"), cap14: parts.cap14.replace(/syncCargoSensorIncidentsForCompany/g, "processOutOfRangeAlerts") },
  ];
  if (!verify(parts) || mutations.some(verify)) process.exit(1);
  console.log("verify-go20-d-cargo-sensor-incidents SELFTEST PASS — 3/3 planted regressions rejected");
  process.exit(0);
}
if (!verify(parts)) process.exit(1);
console.log("verify-go20-d-cargo-sensor-incidents PASS");
