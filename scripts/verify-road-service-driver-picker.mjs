#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-road-service-driver-picker";
const FE = "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx";
const API = "apps/backend/src/maintenance/road-service/tickets.routes.ts";
const fe = fs.readFileSync(FE, "utf8");
const api = fs.readFileSync(API, "utf8");

function audit(frontend, backend) {
  const failures = [];
  const picker = frontend.match(/<EntityPicker\s+kind="driver"([\s\S]*?)\/>/)?.[1] ?? "";
  if (!picker) failures.push("road-service creator must expose the canonical driver picker");
  if (!/operatingCompanyId=\{operatingCompanyId\}/.test(picker)) failures.push("driver picker must be company scoped");
  if (!/value=\{driverId \|\| null\}/.test(picker)) failures.push("driver picker must control submitted driver state");
  if (!/setDriverId\(next \?\? ""\)/.test(picker)) failures.push("driver selection must update submitted driver state");
  if (!/driver_id:\s*driverId \|\| undefined/.test(frontend)) failures.push("creator must forward selected driver_id");
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(backend)) failures.push("POST schema must accept driver_id");
  if (!/body\.data\.unit_id,\s*body\.data\.driver_id \?\? null,\s*user\.uuid/.test(backend)) {
    failures.push("POST INSERT values must persist driver_id between unit_id and dispatcher_user_id");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [fe.replace('kind="driver"', 'kind="unit"'), api, "picker kind"],
    [fe.replace("driver_id: driverId || undefined", "driver_id: undefined"), api, "submit FK"],
    [
      fe,
      api.replace(
        /body\.data\.unit_id,(\s*)body\.data\.driver_id \?\? null,(\s*)user\.uuid/,
        "body.data.unit_id,$1null,$2user.uuid",
      ),
      "writer FK",
    ],
  ];
  for (const [front, back, name] of mutations) {
    if (audit(front, back).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — picker, submit, and writer mutations detected`);
  process.exit(0);
}

const failures = audit(fe, api);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — road-service create scopes a canonical driver picker and persists its FK`);
