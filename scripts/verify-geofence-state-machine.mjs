#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/0408_geofence_state_transitions.sql");
contains("db/migrations/0408_geofence_state_transitions.sql", migration, [
  { pattern: /geo\.geofence_state_transitions/, label: "state transitions table" },
  { pattern: /current_state/, label: "current_state column" },
  { pattern: /'idle'.*'approaching'.*'at'.*'dwelling'.*'departing'.*'departed'/, label: "6 states check" },
]);

const states = read("apps/backend/src/integrations/samsara/geofences/state-machine/states.ts");
contains("apps/backend/src/integrations/samsara/geofences/state-machine/states.ts", states, [
  { pattern: /GEOFENCE_STATES/, label: "GEOFENCE_STATES export" },
  { pattern: /VALID_TRANSITIONS/, label: "VALID_TRANSITIONS export" },
  { pattern: /APPROACHING_RADIUS_M/, label: "approach radius" },
]);

read("apps/backend/src/integrations/samsara/geofences/state-machine/engine.ts");
read("apps/backend/src/integrations/samsara/geofences/state-machine/transitions.service.ts");

const routes = read("apps/backend/src/integrations/samsara/geofences/state-machine/routes.ts");
contains("apps/backend/src/integrations/samsara/geofences/state-machine/routes.ts", routes, [
  { pattern: /\/api\/v1\/integrations\/samsara\/geofences\/:uuid\/state/, label: "state route" },
  { pattern: /\/api\/v1\/integrations\/samsara\/geofences\/:uuid\/transitions/, label: "transitions route" },
  { pattern: /manual-transition/, label: "manual transition route" },
  { pattern: /registerGeofenceStateMachineRoutes/, label: "register export" },
]);

const worker = read("apps/backend/src/jobs/geofence-state-watcher.ts");
contains("apps/backend/src/jobs/geofence-state-watcher.ts", worker, [
  { pattern: /initializeGeofenceStateWatcher/, label: "worker initializer" },
  { pattern: /5 \* 60 \* 1000/, label: "5min interval" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerGeofenceStateMachineRoutes/, label: "routes registered" },
  { pattern: /initializeGeofenceStateWatcher/, label: "worker registered" },
]);

read("apps/backend/src/integrations/samsara/geofences/state-machine/__tests__/engine.test.ts");
read("apps/backend/src/integrations/samsara/geofences/state-machine/__tests__/transitions.test.ts");
read("apps/backend/src/dispatch/geofences/load-geofence-binding.service.ts");
read("docs/specs/gap-39-geofence-state-machine.md");

const manifest = read(".block-ready/GAP-39.json");
contains(".block-ready/GAP-39.json", manifest, [
  { pattern: /GAP-39/, label: "GAP-39 block id" },
  { pattern: /verify:geofence-state-machine/, label: "verify gate" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:geofence-state-machine/, label: "npm verify script" },
]);

if (failures.length > 0) {
  console.error("verify-geofence-state-machine FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-geofence-state-machine OK");
