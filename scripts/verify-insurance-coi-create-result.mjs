#!/usr/bin/env node
import fs from "node:fs";

const SERVICE = "apps/backend/src/insurance/coi.service.ts";
const ROUTES = "apps/backend/src/insurance/coi-request.routes.ts";
const service = fs.readFileSync(SERVICE, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");

function failures(input) {
  const createStart = input.routes.indexOf('app.post(\n    "/api/v1/insurance/coi-requests"');
  const patchStart = createStart < 0
    ? -1
    : input.routes.indexOf('app.patch("/api/v1/insurance/coi-requests/:id"', createStart);
  const createRoute = createStart < 0 || patchStart < 0
    ? ""
    : input.routes.slice(createStart, patchStart);
  const checks = [
    ["creator limiter", /coi-requests"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/.test(createRoute)],
    ["service insert identity", /const created = insert\.rows\[0\];\s*if \(!created\?\.id\) throw new Error\("insurance_coi_request_insert_failed"\)/.test(input.service)],
    ["service returns proven row", /return \{ kind: "ok" as const, row: created \}/.test(input.service)],
    ["audit uses service row id", /insurance\.coi_request\.created[\s\S]{0,140}resource_id: result\.row\?\.id/.test(createRoute)],
    ["201 uses proven service row", /reply\.code\(201\)\.send\(created\.row\)/.test(createRoute)],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const source = { service, routes };
const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-coi-create-result FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["routes", '"/api/v1/insurance/coi-requests",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', '"/api/v1/insurance/coi-requests",\n    { config: {} },'],
    ["service", 'if (!created?.id) throw new Error("insurance_coi_request_insert_failed");', ""],
    ["service", 'row: created', 'row: insert.rows[0]'],
    ["routes", "reply.code(201).send(created.row)", "reply.code(201).send(undefined)"],
  ];
  for (const [file, from, to] of mutations) {
    const changed = { ...source, [file]: source[file].replace(from, to) };
    if (changed[file] === source[file] || failures(changed).length === 0) {
      console.error(`verify-insurance-coi-create-result selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-coi-create-result --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-coi-create-result PASS — COI create requires a canonical row before audit/201");
