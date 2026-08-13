#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-safety-permit-unit-picker";
const FE = "apps/frontend/src/pages/safety/PermitsPage.tsx";
const API = "apps/backend/src/safety/permits.routes.ts";
const fe = fs.readFileSync(FE, "utf8");
const api = fs.readFileSync(API, "utf8");

function audit(frontend, backend) {
  const failures = [];
  const createWriter = backend.slice(backend.indexOf("INSERT INTO safety.permits"), backend.indexOf('app.patch("/api/v1/safety/permits/:id"'));
  const picker = frontend.match(/<EntityPicker\s+kind="unit"([\s\S]*?)\/>/)?.[1] ?? "";
  if (!picker) failures.push("permit creator must expose the canonical unit picker");
  if (!/operatingCompanyId=\{operatingCompanyId\}/.test(picker)) failures.push("unit picker must be company scoped");
  if (!/value=\{draft\.unit_id \|\| null\}/.test(picker)) failures.push("unit picker must control submitted draft state");
  if (!/allowCreate=\{false\}/.test(picker)) failures.push("permit association must not nest unit creation");
  if (!/unit_id:\s*draft\.unit_id \|\| null/.test(frontend)) failures.push("permit creator must forward unit_id");
  if (!/unit_id:\s*z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(backend)) failures.push("POST schema must accept optional unit_id");
  if (!/body\.data\.unit_id \?\? null/.test(createWriter)) failures.push("POST writer must persist unit_id");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [fe.replace('kind="unit"', 'kind="driver"'), api, "picker kind"],
    [fe.replace("unit_id: draft.unit_id || null", "unit_id: null"), api, "submit FK"],
    [fe, api.replace("body.data.unit_id ?? null", "null"), "writer FK"],
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
console.log(`${LABEL} PASS — safety permit create scopes a canonical unit picker and persists its FK`);
