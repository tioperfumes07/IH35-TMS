#!/usr/bin/env node
import fs from "node:fs";

const routePath = "apps/backend/src/fuel/planner.routes.ts";
const apiPath = "apps/frontend/src/api/fuelPlanner.ts";
const pagePath = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";

function verify(route, api, page) {
  const failures = [];
  if (!/const enqueueResult = await enqueueOutboxEvent\([\s\S]*`fuel:recommendation:\$\{companyId\}:\$\{params\.data\.id\}:driver-notice`/.test(route)) failures.push("send must use stable company+recommendation dedupe key");
  if (!/if \(enqueueResult\.enqueued\) \{[\s\S]*await appendCrudAudit/.test(route)) failures.push("audit must be conditional on winning enqueue");
  if (!/delivery_status: enqueueResult\.enqueued[\s\S]*"already_queued"/.test(route)) failures.push("retry must return already_queued");
  if (!/queued_at: enqueueResult\.enqueued \? new Date\(\)\.toISOString\(\) : null/.test(route)) failures.push("retry must not invent enqueue timestamp");
  if (!/"queued" \| "already_queued"/.test(api)) failures.push("client contract must include retry outcome");
  if (!/Recommendation is already queued/.test(page)) failures.push("UI must disclose duplicate suppression");
  return failures;
}

const route = fs.readFileSync(routePath, "utf8");
const api = fs.readFileSync(apiPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");
const failures = verify(route, api, page);
if (process.argv.includes("--selftest")) {
  const mutations = [
    [route.replace(/,\n\s*`fuel:recommendation:\$\{companyId\}:\$\{params\.data\.id\}:driver-notice`/, ""), api, page],
    [route.replace("if (enqueueResult.enqueued) {", "if (true) {"), api, page],
    [route.replace(': ("already_queued" as const)', ': ("queued" as const)'), api, page],
    [route.replace("queued_at: enqueueResult.enqueued ? new Date().toISOString() : null,", "queued_at: new Date().toISOString(),"), api, page],
    [route, api.replace('"queued" | "already_queued"', '"queued"'), page],
    [route, api, page.replace("Recommendation is already queued", "Recommendation queued for delivery")],
  ];
  const escaped = mutations.flatMap(([r, a, p], index) => verify(r, a, p).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: fuel recommendation send is exactly-once and retry-honest");
