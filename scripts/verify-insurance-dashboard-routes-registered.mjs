#!/usr/bin/env node
// Guard (insurance dashboard): every backend endpoint the insurance dashboard depends on
// must be REGISTERED — a missing route 404'd the dashboard ("Failed to load widgets").
// The dashboard now uses a single /api/v1/insurance/summary aggregate; assert it exists
// end-to-end (frontend api fn → backend route registered + wired into index.ts).
import { readFileSync } from "node:fs";

const failures = [];
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { failures.push(`${p}: missing`); return ""; } };

// 1. Frontend dashboard calls the summary aggregate.
const landing = read("apps/frontend/src/pages/insurance/InsuranceLanding.tsx");
if (landing && !/getInsuranceSummary/.test(landing)) {
  failures.push("InsuranceLanding.tsx: must source its KPIs from getInsuranceSummary (the registered aggregate)");
}
// 2. The api fn targets /api/v1/insurance/summary.
const api = read("apps/frontend/src/api/insurance.ts");
if (api && !/\/api\/v1\/insurance\/summary/.test(api)) {
  failures.push("api/insurance.ts: getInsuranceSummary must call /api/v1/insurance/summary");
}
// 3. Backend registers the route.
const route = read("apps/backend/src/insurance/summary.routes.ts");
if (route && !/app\.get\("\/api\/v1\/insurance\/summary"/.test(route)) {
  failures.push("summary.routes.ts: must register GET /api/v1/insurance/summary");
}
// 4. The route is wired into the server.
const index = read("apps/backend/src/index.ts");
if (index && !/registerInsuranceSummaryRoutes\(app\)/.test(index)) {
  failures.push("index.ts: registerInsuranceSummaryRoutes(app) must be called");
}

if (failures.length) {
  console.error("verify:insurance-dashboard-routes-registered — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:insurance-dashboard-routes-registered — OK (dashboard summary route registered end-to-end)");
