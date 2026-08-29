#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routePath = path.join(root, "apps/backend/src/fuel/planner.routes.ts");
const apiPath = path.join(root, "apps/frontend/src/api/fuelPlanner.ts");
const pagePath = path.join(root, "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx");

function verify(route, api, page) {
  const failures = [];
  if (!/delivery_status:\s*enqueueResult\.enqueued\s*\?\s*\("queued" as const\)\s*:\s*\("already_queued" as const\)/.test(route)) failures.push("backend must distinguish newly queued from already queued");
  if (!/queued_at:\s*enqueueResult\.enqueued\s*\?\s*new Date\(\)\.toISOString\(\)\s*:\s*null/.test(route)) failures.push("backend must timestamp only a newly queued delivery");
  if (/sent_at: new Date\(\)\.toISOString\(\)/.test(route)) failures.push("backend must not claim synchronous sent_at");
  if (!/delivery_status: "queued" \| "already_queued";[\s\S]{0,80}queued_at: string \| null/.test(api)) failures.push("frontend contract must model idempotent queued delivery");
  if (!/Recommendation queued for delivery/.test(page)) failures.push("toast must disclose queued delivery");
  if (/Recommendation sent to driver app/.test(page)) failures.push("toast must not claim driver delivery");
  return failures;
}

const route = fs.readFileSync(routePath, "utf8");
const api = fs.readFileSync(apiPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");
const failures = verify(route, api, page);

if (process.argv.includes("--selftest")) {
  if (failures.length) {
    console.error(`SELFTEST FAIL: baseline is red: ${failures.join("; ")}`);
    process.exit(1);
  }
  const mutations = [
    [route.replace('(\"queued\" as const) : (\"already_queued\" as const)', '(\"sent\" as const)'), api, page],
    [route.replace('queued_at: enqueueResult.enqueued ? new Date().toISOString() : null', 'sent_at: new Date().toISOString()'), api, page],
    [route, api.replace('delivery_status: "queued" | "already_queued";', 'delivery_status: "sent";'), page],
    [route, api, page.replace("Recommendation queued for delivery", "Recommendation sent to driver app")],
  ];
  const escaped = mutations.filter(([r, a, p]) => verify(r, a, p).length === 0);
  if (escaped.length) {
    console.error(`SELFTEST FAIL: ${escaped.length} planted defect(s) escaped`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: fuel recommendation send reports queued delivery truthfully");
