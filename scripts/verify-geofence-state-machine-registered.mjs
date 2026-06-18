#!/usr/bin/env node
// Guard (GAP-39): the geofence state-machine routes must stay REGISTERED in index.ts. The route file
// was complete but never wired (registerGeofenceStateMachineRoutes was never called), so the feature was
// dead on the live server — the same "built but unregistered" trap as HOS-in-dead-component. This locks
// the import + the registration call so it can't silently drop out again. Also asserts the owner-only
// write uses the canonical capitalized role ("Owner"), not the lowercase that made it always-403.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-geofence-state-machine-registered: ${m}`); process.exit(1); };
const read = (p) => readFileSync(join(root, p), "utf8");

const index = read("apps/backend/src/index.ts");
if (!/import \{ registerGeofenceStateMachineRoutes \}/.test(index)) fail("registerGeofenceStateMachineRoutes not imported in index.ts");
if (!/await registerGeofenceStateMachineRoutes\(app\)/.test(index)) fail("registerGeofenceStateMachineRoutes(app) not called in index.ts (route would be dead)");

const route = read("apps/backend/src/integrations/samsara/geofences/state-machine/routes.ts");
if (!/\/api\/v1\/integrations\/samsara\/geofences\/:uuid\/state/.test(route)) fail("state route path missing");
// Per-entity scope must remain (operating_company_id GUC + assertTenantContext).
if (!/set_config\(`?'?app\.operating_company_id/.test(route) && !/app\.operating_company_id/.test(route)) fail("route must set app.operating_company_id (per-entity scope)");
if (!/assertTenantContext/.test(route)) fail("route must assertTenantContext (per-entity isolation)");
// Owner-only write must use the capitalized canonical role.
if (/user\.role !== "owner"/.test(route)) fail('manual-transition role check must be "Owner" (capitalized) — lowercase makes it always-403');
if (!/user\.role !== "Owner"/.test(route)) fail("manual-transition must remain owner-gated");

console.log("PASS verify-geofence-state-machine-registered");
