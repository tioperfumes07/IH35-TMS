#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const PAGE = "apps/frontend/src/pages/Customers.tsx";
const API = "apps/frontend/src/api/audit.ts";
const ROUTE = "apps/backend/src/audit/spine-events.routes.ts";
const REQUIRED = "docs/specs/scoreboard/modules/customers.required.json";
const BUILT = "docs/specs/scoreboard/wire-sprint-built.json";
const PLACEHOLDER = "Activity Feed shows create/edit/payment events for this customer";

const read = (path) => fs.readFileSync(path, "utf8");

export function collectFailures(sources) {
  const failures = [];
  const requireText = (key, needle, message) => {
    if (!sources[key].includes(needle)) failures.push(message);
  };

  requireText("page", "function CustomerActivityFeed", "missing real CustomerActivityFeed component");
  requireText("page", "listSpineEvents({", "activity feed does not call the canonical spine API");
  requireText("page", 'entityType: "customer"', "activity feed is not filtered to customer subjects");
  requireText("page", "entityId: customerId", "activity feed is not filtered to the selected customer id");
  requireText("page", '["customers", "activity-feed", operatingCompanyId, customerId]', "query key is not company+customer scoped");
  requireText("page", "Couldn't load customer activity", "activity feed lacks an explicit error state");
  requireText("page", "onRetry={() => void activityQuery.refetch()}", "activity feed lacks retry wiring");
  requireText("page", "No recorded activity for this customer.", "activity feed lacks an honest settled empty state");
  requireText("page", 'activeTab === "activity_feed"', "Activity Feed tab is not mounted");
  if (sources.page.includes(PLACEHOLDER)) failures.push("static Activity Feed placeholder remains");

  requireText("api", "/api/v1/audit/spine-events", "frontend canonical spine API is missing");
  requireText("api", 'search.set("entity_type", params.entityType)', "frontend API drops entity_type");
  requireText("api", 'search.set("entity_id", params.entityId)', "frontend API drops entity_id");
  requireText("route", "el.operating_company_id = $1::uuid", "backend spine read is not company scoped");
  requireText("route", "el.subject_type = $", "backend spine read lacks subject_type filter");
  requireText("route", "el.subject_id = $", "backend spine read lacks subject_id filter");
  requireText("route", "set_config('app.operating_company_id'", "backend spine read does not set company RLS context");

  let required;
  let built;
  try { required = JSON.parse(sources.required); } catch { failures.push("customers.required.json is invalid JSON"); }
  try { built = JSON.parse(sources.built); } catch { failures.push("wire-sprint-built.json is invalid JSON"); }
  const leaf = required?.leaves?.find?.((item) => item.id === "md.activity_feed");
  for (const col of ["customer", "connectivity"]) {
    if (!leaf?.required?.includes(col)) failures.push(`md.activity_feed does not honestly require ${col}`);
  }
  const entry = built?.entries?.find?.((item) => item.task === "CUST-F6310-CUSTOMER-ACTIVITY-FEED-REAL-SPINE");
  if (entry?.leafRe !== "^md\\.activity_feed$") failures.push("Built evidence does not exact-own md.activity_feed");
  for (const col of ["customer", "connectivity"]) {
    if (!entry?.cols?.includes(col)) failures.push(`Built evidence does not own ${col}`);
  }
  return failures;
}

const sources = {
  page: read(PAGE),
  api: read(API),
  route: read(ROUTE),
  required: read(REQUIRED),
  built: read(BUILT),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drops-customer-filter", key: "page", from: 'entityType: "customer"', to: 'entityType: "vendor"' },
    { name: "drops-selected-id", key: "page", from: "entityId: customerId", to: "entityId: undefined" },
    { name: "restores-placeholder", key: "page", from: "function CustomerActivityFeed", to: `${PLACEHOLDER}\nfunction CustomerActivityFeed` },
    { name: "drops-retry", key: "page", from: "onRetry={() => void activityQuery.refetch()}", to: "onRetry={undefined}" },
    { name: "drops-company-scope", key: "route", from: "el.operating_company_id = $1::uuid", to: "TRUE" },
    {
      name: "drops-required-customer",
      key: "required",
      from: '"id": "md.activity_feed",\n      "tab": "Customer Detail",\n      "sub": "Activity Feed tab",\n      "route_hint": "/customers?tab=activity_feed",\n      "required": [\n        "customer",\n        "connectivity"\n      ]',
      to: '"id": "md.activity_feed",\n      "tab": "Customer Detail",\n      "sub": "Activity Feed tab",\n      "route_hint": "/customers?tab=activity_feed",\n      "required": [\n        "connectivity"\n      ]',
    },
    {
      name: "broadens-built-leaf",
      key: "built",
      from: '"task": "CUST-F6310-CUSTOMER-ACTIVITY-FEED-REAL-SPINE",\n      "modules": [\n        "customers"\n      ],\n      "cols": [\n        "customer",\n        "connectivity"\n      ],\n      "leafRe": "^md\\\\.activity_feed$"',
      to: '"task": "CUST-F6310-CUSTOMER-ACTIVITY-FEED-REAL-SPINE",\n      "modules": [\n        "customers"\n      ],\n      "cols": [\n        "customer",\n        "connectivity"\n      ],\n      "leafRe": ".*"',
    },
  ];
  for (const mutation of mutations) {
    const changed = sources[mutation.key].replace(mutation.from, mutation.to);
    if (changed === sources[mutation.key]) throw new Error(`selftest setup failed: ${mutation.name}`);
    const failures = collectFailures({ ...sources, [mutation.key]: changed });
    if (failures.length === 0) throw new Error(`selftest missed: ${mutation.name}`);
  }
  console.log(`verify:customer-activity-feed-wired SELFTEST PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error("verify:customer-activity-feed-wired FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("verify:customer-activity-feed-wired PASS — selected-company customer spine feed is real and leaf-specific");
