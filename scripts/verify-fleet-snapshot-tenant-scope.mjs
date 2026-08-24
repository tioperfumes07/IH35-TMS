#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "reports", "library.routes.ts");

function fail(message) {
  console.error(`verify:fleet-snapshot-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/reports/library.routes.ts not found");
}

function evaluate(text) {
  const failures = [];
  const routeMatch = text.match(/app\.get\("\/api\/v1\/reports\/home-fleet-snapshot"[\s\S]*?\n  \}\);/m);
  if (!routeMatch) return ["could not locate /api/v1/reports/home-fleet-snapshot route"];
  const routeBlock = routeMatch[0];
  if (!/set_config\('app\.operating_company_id'/.test(routeBlock)) {
    failures.push("route must set app.operating_company_id tenant context");
  }
  if (!/operating_company_id\s*=\s*current_setting\('app\.operating_company_id', true\)::uuid/.test(routeBlock)) {
    failures.push("backing query must include operating_company_id where-clause");
  }
  if (!/FROM mdata\.units/.test(routeBlock) || !/total_units/.test(routeBlock)) {
    failures.push("route must compute total units from mdata.units");
  }
  return failures;
}

const text = fs.readFileSync(TARGET, "utf8");
const failures = evaluate(text);
if (failures.length) fail(failures.join("\n- "));

if (process.argv.includes("--selftest")) {
  const mutateRoute = (needle, replacement) => {
    const start = text.indexOf('app.get("/api/v1/reports/home-fleet-snapshot"');
    return text.slice(0, start) + text.slice(start).replaceAll(needle, replacement);
  };
  const mutations = [
    ["tenant-context", mutateRoute("set_config('app.operating_company_id'", "set_config('app.wrong_company_id'")],
    ["company-predicate", mutateRoute("operating_company_id = current_setting('app.operating_company_id', true)::uuid", "TRUE")],
    ["canonical-unit-source", mutateRoute("FROM mdata.units", "FROM mdata.drivers")],
  ];
  for (const [name, mutated] of mutations) {
    if (mutated === text || evaluate(mutated).length === 0) {
      fail(`selftest mutation escaped: ${name}`);
    }
  }
  console.log(`verify:fleet-snapshot-tenant-scope — SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

console.log("verify:fleet-snapshot-tenant-scope — OK");
