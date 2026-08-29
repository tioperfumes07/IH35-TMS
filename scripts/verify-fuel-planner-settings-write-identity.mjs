#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/fuel/planner.routes.ts", "utf8");

function verify(value) {
  const failures = [];
  const routeStart = value.indexOf('app.patch("/api/v1/fuel/planner/settings"');
  const route = value.slice(routeStart);
  if (routeStart < 0) failures.push("mounted settings PATCH missing");
  if (!route.includes("class FuelPlannerSettingsWriteError") && !value.includes("class FuelPlannerSettingsWriteError")) failures.push("typed settings write error missing");
  if (!route.includes("const updatedRow = updateRes.rows[0]")) failures.push("canonical update identity is not captured");
  if (!route.includes("if (!updatedRow) throw new FuelPlannerSettingsWriteError()")) failures.push("zero-row settings write is not rejected");
  if (!route.includes("resource_id: companyId") || !route.includes("return updatedRow")) failures.push("audit/response must follow checked identity");
  if (!route.includes("error instanceof FuelPlannerSettingsWriteError") || !route.includes("reply.code(409)")) failures.push("typed conflict mapping missing");
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`[verify-fuel-planner-settings-write-identity] FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const updatedRow = updateRes.rows[0]", "const updatedRow = {}"],
    ["if (!updatedRow) throw new FuelPlannerSettingsWriteError()", "if (false) throw new FuelPlannerSettingsWriteError()"],
    ["return updatedRow", "return updateRes.rows[0]"],
    ["error instanceof FuelPlannerSettingsWriteError", "false"],
    ["reply.code(409)", "reply.code(200)"],
  ];
  for (const [needle, replacement] of mutations) {
    if (verify(source.replace(needle, replacement)).length === 0) {
      console.error(`[verify-fuel-planner-settings-write-identity] SELFTEST FAIL: ${needle}`);
      process.exit(1);
    }
  }
  console.log(`[verify-fuel-planner-settings-write-identity] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

console.log("[verify-fuel-planner-settings-write-identity] PASS");
