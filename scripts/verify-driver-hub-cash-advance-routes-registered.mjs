#!/usr/bin/env node
// Guard (DHUB-1): the driver-hub cash-advance approve/deny routes
// (registerDriverHubRequestRoutes) MUST be called at boot in apps/backend/src/index.ts.
// History: the function was defined in cash-advances/driver-hub-requests.routes.ts but never
// registered, so POST /api/v1/cash-advances/hub/requests/:id/{approve,deny} (which the frontend
// driverHubRequests.ts calls to MOVE MONEY — approve books a settlement deduction) 404'd. This
// guard fails if the registration is ever dropped again.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL verify-driver-hub-cash-advance-routes-registered: ${m}`);
  process.exit(1);
};
const src = readFileSync(join(root, "apps/backend/src/index.ts"), "utf8");

if (!/import\s*\{\s*registerDriverHubRequestRoutes\s*\}\s*from\s*["']\.\/cash-advances\/driver-hub-requests\.routes\.js["']/.test(src)) {
  fail("registerDriverHubRequestRoutes must be imported from ./cash-advances/driver-hub-requests.routes.js");
}
if (!/await registerDriverHubRequestRoutes\(app\);/.test(src)) {
  fail("registerDriverHubRequestRoutes(app) must be called at boot (approve/deny 404 without it)");
}
console.log("PASS verify-driver-hub-cash-advance-routes-registered");
