#!/usr/bin/env node
// M06-G1: the Road Service ticket backend (registerRoadServiceTicketRoutes) existed but was never
// mounted in index.ts — GET/POST /api/v1/road-service-tickets was a live 404. Fix = import + call
// registerRoadServiceTicketRoutes(app) in the maintenance route mount block. This guard locks it so
// the mount can't silently regress. Self-test: --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-road-service-route-mounted";

export function check(routes, index) {
  const e = [];
  if (!/export\s+async\s+function\s+registerRoadServiceTicketRoutes\s*\(/.test(routes)) {
    e.push("road-service/tickets.routes.ts must export registerRoadServiceTicketRoutes(app)");
  }
  if (!/app\.get\(\s*["']\/api\/v1\/road-service-tickets["']/.test(routes)) {
    e.push("route file must GET /api/v1/road-service-tickets");
  }
  if (!/app\.post\(\s*["']\/api\/v1\/road-service-tickets["']/.test(routes)) {
    e.push("route file must POST /api/v1/road-service-tickets");
  }
  if (!/import\s*\{\s*registerRoadServiceTicketRoutes\s*\}\s*from\s*["']\.\/maintenance\/road-service\/tickets\.routes\.js["']/.test(index)) {
    e.push("index.ts must import registerRoadServiceTicketRoutes from ./maintenance/road-service/tickets.routes.js");
  }
  if (!/await\s+registerRoadServiceTicketRoutes\s*\(\s*app\s*\)/.test(index)) {
    e.push("index.ts must call await registerRoadServiceTicketRoutes(app) (this was the missing mount — live 404)");
  }
  return e;
}

if (process.argv.includes("--selftest")) {
  const goodRoutes = [
    "export async function registerRoadServiceTicketRoutes(app) {",
    'app.get("/api/v1/road-service-tickets", async () => {});',
    'app.post("/api/v1/road-service-tickets", async () => {});',
  ].join("\n");
  const goodIndex = [
    'import { registerRoadServiceTicketRoutes } from "./maintenance/road-service/tickets.routes.js";',
    "await registerRoadServiceTicketRoutes(app);",
  ].join("\n");
  if (check(goodRoutes, goodIndex).length) {
    console.error(`${LABEL} --selftest FAILED good`);
    process.exit(1);
  }
  const badErrors = check("// nothing", "// nothing");
  if (badErrors.length !== 5) {
    console.error(`${LABEL} --selftest FAILED bad (expected 5 errors, got ${badErrors.length})`);
    process.exit(1);
  }
  // Regression case: backend exists but mount call is missing (the actual bug being fixed).
  const unmountedIndexErrors = check(goodRoutes, "// no import, no call");
  if (unmountedIndexErrors.length !== 2) {
    console.error(`${LABEL} --selftest FAILED unmounted-regression case (expected 2 errors, got ${unmountedIndexErrors.length})`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK`);
} else {
  const routes = fs.readFileSync(
    path.join(ROOT, "apps/backend/src/maintenance/road-service/tickets.routes.ts"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(ROOT, "apps/backend/src/index.ts"), "utf8");
  const e = check(routes, index);
  if (e.length) {
    console.error(`${LABEL} — FAILED`);
    for (const x of e) console.error("- " + x);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (Road Service ticket routes mounted → registerRoadServiceTicketRoutes(app))`);
}
