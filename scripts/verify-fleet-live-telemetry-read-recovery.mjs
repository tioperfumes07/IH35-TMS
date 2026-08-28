#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const source = fs.readFileSync(file, "utf8");
function verify(text) {
  const failures = [];
  if (!/const telemetry = telemetryQuery\.isError \? null : telemetryQuery\.data \?\? profile;/.test(text)) failures.push("failed refresh must suppress retained live telemetry");
  if (!/Couldn't refresh live telemetry/.test(text)) failures.push("telemetry failure must remain visible");
  if (!/onRetry=\{\(\) => void telemetryQuery\.refetch\(\)\}/.test(text)) failures.push("telemetry failure needs exact Retry");
  return failures;
}
const failures = verify(source);
if (failures.length) { failures.forEach((f) => console.error(`- ${f}`)); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [source.replace("telemetryQuery.isError ? null :", "false ? null :"), source.replace("Couldn't refresh live telemetry", "Live telemetry"), source.replace("onRetry={() => void telemetryQuery.refetch()}", "onRetry={() => undefined}")];
  mutations.forEach((m, i) => { if (verify(m).length === 0) { console.error(`selftest mutation ${i + 1} escaped`); process.exit(1); } });
  console.log("fleet live telemetry read recovery selftest PASS (3/3)");
}
console.log("fleet live telemetry read recovery PASS");
