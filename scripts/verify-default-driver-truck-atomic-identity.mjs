#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const UNIT = "apps/backend/src/mdata/unit-default-driver.routes.ts";
const DRIVER = "apps/backend/src/mdata/driver-default-truck.routes.ts";

function setBlock(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

function inspect(unitSource, driverSource) {
  const failures = [];
  const unit = setBlock(unitSource, 'app.post("/api/v1/mdata/units/:id/drivers/default"', 'app.post("/api/v1/mdata/units/:id/drivers/clear-default"');
  const driver = setBlock(driverSource, 'app.post("/api/v1/mdata/drivers/:id/default-truck"', 'app.post("/api/v1/mdata/drivers/:id/clear-default-truck"');
  const checks = [
    ["unit transaction", unit, /BEGIN[\s\S]*COMMIT[\s\S]*ROLLBACK/],
    ["unit driver scope", unit, /assertDriverScope\(client, body\.data\.driver_id/],
    ["unit insert identity", unit, /RETURNING id::text AS id[\s\S]*if \(!assignmentId\) throw new Error\("unit_default_driver_insert_failed"\)/],
    ["unit audit identity", unit, /assignment_id: assignmentId/],
    ["unit driver 404", unit, /mdata_driver_not_found/],
    ["driver transaction", driver, /BEGIN[\s\S]*COMMIT[\s\S]*ROLLBACK/],
    ["driver parents", driver, /assertDriverScope[\s\S]*assertUnitScope/],
    ["driver insert identity", driver, /RETURNING id::text AS id[\s\S]*if \(!assignmentId\) throw new Error\("driver_default_truck_insert_failed"\)/],
    ["driver audit identity", driver, /assignment_id: assignmentId/],
  ];
  for (const [label, source, pattern] of checks) if (!pattern.test(source)) failures.push(label);
  return failures;
}

const unitSource = fs.readFileSync(UNIT, "utf8");
const driverSource = fs.readFileSync(DRIVER, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    [unitSource.replace('await client.query("BEGIN");', "// planted"), driverSource],
    [unitSource.replace("assertDriverScope(client, body.data.driver_id", "assertUnitScope(client, body.data.driver_id"), driverSource],
    [unitSource.replace('if (!assignmentId) throw new Error("unit_default_driver_insert_failed");', "// planted"), driverSource],
    [unitSource.replace("assignment_id: assignmentId", "assignment_id: null"), driverSource],
    [unitSource.replace('return { error: "mdata_driver_not_found" as const };', 'return { error: "mdata_unit_not_found" as const };'), driverSource],
    [unitSource, driverSource.replace('await client.query("BEGIN");', "// planted")],
    [unitSource, driverSource.replace("assertUnitScope(client, body.data.unit_id", "assertDriverScope(client, body.data.unit_id")],
    [unitSource, driverSource.replace('if (!assignmentId) throw new Error("driver_default_truck_insert_failed");', "// planted")],
    [unitSource, driverSource.replace("assignment_id: assignmentId", "assignment_id: null")],
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
console.log("PASS verify-default-driver-truck-atomic-identity — both directions validate parents, transact clear+insert, and audit canonical assignment id");
