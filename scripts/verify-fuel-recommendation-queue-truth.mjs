#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routePath = path.join(root, "apps/backend/src/fuel/planner.routes.ts");
const apiPath = path.join(root, "apps/frontend/src/api/fuelPlanner.ts");
const pagePath = path.join(root, "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx");

function verify(route, api, page) {
  const failures = [];
  if (!/delivery_status:\s*"queued" as const[\s\S]*queued_at: new Date\(\)\.toISOString\(\)/.test(route)) failures.push("backend must report queued status and queued_at");
  if (/sent_at: new Date\(\)\.toISOString\(\)/.test(route)) failures.push("backend must not claim synchronous sent_at");
  if (!/delivery_status: "queued"; queued_at: string/.test(api)) failures.push("frontend contract must model queued delivery");
  if (!/Recommendation queued for delivery/.test(page)) failures.push("toast must disclose queued delivery");
  if (/Recommendation sent to driver app/.test(page)) failures.push("toast must not claim driver delivery");
  return failures;
}

const route = fs.readFileSync(routePath, "utf8");
const api = fs.readFileSync(apiPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");
const failures = verify(route, api, page);

if (process.argv.includes("--selftest")) {
  const mutations = [
    [route.replace('delivery_status: "queued" as const,', 'delivery_status: "sent" as const,'), api, page],
    [route.replace("queued_at: new Date().toISOString(),", "sent_at: new Date().toISOString(),"), api, page],
    [route, api.replace('delivery_status: "queued"; queued_at: string', "sent_at: string"), page],
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
