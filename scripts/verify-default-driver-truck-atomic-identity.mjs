#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const UNIT = "apps/backend/src/mdata/unit-default-driver.routes.ts";
const DRIVER = "apps/backend/src/mdata/driver-default-truck.routes.ts";

function setBlock(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

function mutateBlock(source, start, end, from, to) {
  const block = setBlock(source, start, end);
  return source.replace(block, block.replace(from, to));
}

function inspect(unitSource, driverSource) {
  const failures = [];
  const unit = setBlock(unitSource, 'app.post("/api/v1/mdata/units/:id/drivers/default"', 'app.post("/api/v1/mdata/units/:id/drivers/clear-default"');
  const driver = setBlock(driverSource, 'app.post("/api/v1/mdata/drivers/:id/default-truck"', 'app.post("/api/v1/mdata/drivers/:id/clear-default-truck"');
  const checks = [
    ["unit wrapper transaction", unit, /withCurrentUser\(user\.uuid, async \(client\) =>/],
    ["unit driver scope", unit, /assertDriverScope\(client, body\.data\.driver_id/],
    ["unit insert identity", unit, /RETURNING id::text AS id[\s\S]*if \(!assignmentId\) throw new Error\("unit_default_driver_insert_failed"\)/],
    ["unit audit identity", unit, /assignment_id: assignmentId/],
    ["unit driver 404", unit, /mdata_driver_not_found/],
    ["driver wrapper transaction", driver, /withCurrentUser\(user\.uuid, async \(client\) =>/],
    ["driver parents", driver, /assertDriverScope[\s\S]*assertUnitScope/],
    ["driver insert identity", driver, /RETURNING id::text AS id[\s\S]*if \(!assignmentId\) throw new Error\("driver_default_truck_insert_failed"\)/],
    ["driver audit identity", driver, /assignment_id: assignmentId/],
  ];
  if (/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(unit)) failures.push("unit nested transaction control");
  if (/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(driver)) failures.push("driver nested transaction control");
  for (const [label, source, pattern] of checks) if (!pattern.test(source)) failures.push(label);
  return failures;
}

const unitSource = fs.readFileSync(UNIT, "utf8");
const driverSource = fs.readFileSync(DRIVER, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    [mutateBlock(unitSource, 'app.post("/api/v1/mdata/units/:id/drivers/default"', 'app.post("/api/v1/mdata/units/:id/drivers/clear-default"', "const result = await withCurrentUser", "const result = await noTransaction"), driverSource],
    [unitSource.replace("assertDriverScope(client, body.data.driver_id", "assertUnitScope(client, body.data.driver_id"), driverSource],
    [unitSource.replace('if (!assignmentId) throw new Error("unit_default_driver_insert_failed");', "// planted"), driverSource],
    [unitSource.replace("assignment_id: assignmentId", "assignment_id: null"), driverSource],
    [unitSource.replace('return { error: "mdata_driver_not_found" as const };', 'return { error: "mdata_unit_not_found" as const };'), driverSource],
    [unitSource, mutateBlock(driverSource, 'app.post("/api/v1/mdata/drivers/:id/default-truck"', 'app.post("/api/v1/mdata/drivers/:id/clear-default-truck"', "const result = await withCurrentUser", "const result = await noTransaction")],
    [unitSource, driverSource.replace("assertUnitScope(client, body.data.unit_id", "assertDriverScope(client, body.data.unit_id")],
    [unitSource, driverSource.replace('if (!assignmentId) throw new Error("driver_default_truck_insert_failed");', "// planted")],
    [unitSource, driverSource.replace("assignment_id: assignmentId", "assignment_id: null")],
    [mutateBlock(unitSource, 'app.post("/api/v1/mdata/units/:id/drivers/default"', 'app.post("/api/v1/mdata/units/:id/drivers/clear-default"', "await setScopedCompanyContext", 'await client.query("COMMIT");\n      await setScopedCompanyContext'), driverSource],
    [unitSource, mutateBlock(driverSource, 'app.post("/api/v1/mdata/drivers/:id/default-truck"', 'app.post("/api/v1/mdata/drivers/:id/clear-default-truck"', "await setScopedCompanyContext", 'await client.query("BEGIN");\n      await setScopedCompanyContext')],
  ];
  const survived = mutations.filter(([unit, driver]) => inspect(unit, driver).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-default-driver-truck-atomic-identity --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-default-driver-truck-atomic-identity --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(unitSource, driverSource);
if (failures.length) {
  console.error(`FAIL verify-default-driver-truck-atomic-identity: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-default-driver-truck-atomic-identity — wrapper-owned transactions validate parents, atomically clear+insert, and audit canonical assignment ids in both directions");
